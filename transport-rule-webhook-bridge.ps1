################################################################################
# Clinical Data Sentinel - Transport Rule Webhook Bridge
# =========================================================================
# Purpose: Bridge between M365 Transport Rule (rejects emails) and CDS Webhook
#
# Workflow:
# 1. Transport rule rejects emails with PHI going to external recipients
# 2. This script monitors for rejection events in message trace
# 3. Reconstructs email details and sends to CDS webhook
# 4. CDS webhook creates incident for admin review
#
# Usage: .\transport-rule-webhook-bridge.ps1 -Mode Monitor
#        .\transport-rule-webhook-bridge.ps1 -Mode Test
################################################################################

param(
    [ValidateSet("Monitor", "Test", "Once")]
    [string]$Mode = "Once",

    [string]$CdsWebhookUrl = "http://localhost:5000/api/webhook/check-email-safety",
    [int]$PollIntervalSeconds = 10,
    [int]$HistoryMinutes = 5
)

# Color output
function Write-Success { Write-Host $args[0] -ForegroundColor Green }
function Write-Error-Custom { Write-Host $args[0] -ForegroundColor Red }
function Write-Info { Write-Host $args[0] -ForegroundColor Cyan }
function Write-Warning-Custom { Write-Host $args[0] -ForegroundColor Yellow }

# Check Exchange Online connection
function Test-ExchangeConnection {
    try {
        $null = Get-ExchangeOnlineSession
        return $true
    } catch {
        return $false
    }
}

# Get the last message trace entry (most recent rejected email)
function Get-RejectedEmails {
    param(
        [int]$MinutesBack = 5
    )

    $startTime = (Get-Date).AddMinutes(-$MinutesBack)

    try {
        Write-Info "[Bridge] Querying message trace for rejected emails in last $MinutesBack minutes..."

        # Query message trace for emails rejected by our transport rule
        $traces = Get-MessageTrace `
            -StartDate $startTime `
            -Status "Failed" `
            -ErrorType "TransportRuleReject" `
            -PageSize 100 | `
            Where-Object { $_.ToIP -eq "SMTP" -or $_.SenderAddress -like "*@*" }

        if ($null -eq $traces) {
            Write-Info "[Bridge] No rejected emails found in message trace."
            return @()
        }

        return $traces
    } catch {
        Write-Error-Custom "[Bridge] Error querying message trace: $_"
        return @()
    }
}

# Get detailed email content from mailbox
function Get-EmailDetails {
    param(
        [string]$MessageId,
        [string]$SenderAddress,
        [datetime]$Timestamp
    )

    try {
        # For recently sent/rejected emails, query the sender's sent items
        $query = "From:$SenderAddress AND Received:>=$(($Timestamp).AddMinutes(-5).ToString('MM/dd/yyyy HH:mm')) AND Received:<=$(($Timestamp).AddMinutes(5).ToString('MM/dd/yyyy HH:mm'))"

        # Use Search-Mailbox or Get-MailboxSearch to find the message
        $mailItem = Get-MessageTrace -MessageId $MessageId -ErrorAction SilentlyContinue

        if ($null -ne $mailItem) {
            return @{
                MessageId = $mailItem.MessageId
                From = $mailItem.SenderAddress
                To = $mailItem.RecipientAddress
                Subject = $mailItem.Subject
                Status = $mailItem.Status
                ErrorType = $mailItem.ErrorType
                Timestamp = $mailItem.Received
            }
        }

        return $null
    } catch {
        Write-Error-Custom "[Bridge] Error getting email details: $_"
        return $null
    }
}

# Send email to CDS webhook for analysis
function Send-ToCdsWebhook {
    param(
        [hashtable]$EmailData,
        [string]$WebhookUrl
    )

    try {
        # Build JSON payload for webhook
        $payload = @{
            messageId = $EmailData.MessageId
            from = $EmailData.From
            to = $EmailData.To
            subject = $EmailData.Subject
            body = $EmailData.Subject  # Use subject as body proxy since we can't extract full content from trace
            timestamp = $EmailData.Timestamp.ToString('o')
            source = "transport_rule"
            status = "rejected"
        } | ConvertTo-Json

        Write-Info "[Bridge] Sending to CDS webhook: $WebhookUrl"
        Write-Info "[Bridge] Payload: $payload"

        $response = Invoke-RestMethod `
            -Uri $WebhookUrl `
            -Method Post `
            -ContentType "application/json" `
            -Body $payload `
            -ErrorAction Stop

        if ($response.allow -eq $false) {
            Write-Success "[Bridge] ✅ Incident created (incident_id: $($response.incident_id))"
            Write-Success "[Bridge]    Risk: $($response.risk_level), Confidence: $($response.confidence)%"
            return $true
        } else {
            Write-Warning-Custom "[Bridge] Email flagged as safe, not creating incident"
            return $false
        }
    } catch {
        Write-Error-Custom "[Bridge] Webhook error: $_"
        return $false
    }
}

# MAIN LOGIC
function Main {
    Write-Info "╔════════════════════════════════════════════════════════════════╗"
    Write-Info "║  Clinical Data Sentinel - Transport Rule Webhook Bridge        ║"
    Write-Info "║  Mode: $Mode                                                  ║"
    Write-Info "║  CDS Webhook: $CdsWebhookUrl"
    Write-Info "╚════════════════════════════════════════════════════════════════╝`n"

    # Test Exchange connection
    if (-not (Test-ExchangeConnection)) {
        Write-Error-Custom "❌ Not connected to Exchange Online!"
        Write-Info "   Run: Connect-ExchangeOnline"
        return
    }
    Write-Success "✅ Connected to Exchange Online"

    # Process based on mode
    switch ($Mode) {
        "Once" {
            Write-Info "`nMode: ONCE - Processing most recent rejection..."
            $traces = Get-RejectedEmails -MinutesBack $HistoryMinutes

            if ($traces.Count -eq 0) {
                Write-Warning-Custom "No rejected emails found in last $HistoryMinutes minutes"
            } else {
                foreach ($trace in $traces) {
                    Write-Info "`nProcessing: $($trace.Subject) to $($trace.RecipientAddress)"

                    $emailData = @{
                        MessageId = $trace.MessageId
                        From = $trace.SenderAddress
                        To = $trace.RecipientAddress
                        Subject = $trace.Subject
                        Timestamp = $trace.Received
                    }

                    Send-ToCdsWebhook -EmailData $emailData -WebhookUrl $CdsWebhookUrl
                }
            }
        }

        "Test" {
            Write-Info "`nMode: TEST - Sending test email to webhook..."

            $testEmail = @{
                MessageId = "TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
                From = "doctor@hospital.com"
                To = "patient@external.com"
                Subject = "Test Email with MRN-2024-98765 and DOB: 15/03/1985"
                Timestamp = Get-Date
            }

            Write-Info "Test payload:"
            Write-Info "  From: $($testEmail.From)"
            Write-Info "  To: $($testEmail.To)"
            Write-Info "  Subject: $($testEmail.Subject)"

            Send-ToCdsWebhook -EmailData $testEmail -WebhookUrl $CdsWebhookUrl
        }

        "Monitor" {
            Write-Info "`nMode: MONITOR - Continuous monitoring (Press Ctrl+C to stop)..."
            Write-Info "Polling interval: $PollIntervalSeconds seconds"
            Write-Info "History window: $HistoryMinutes minutes`n"

            $lastCheck = Get-Date

            while ($true) {
                try {
                    $traces = Get-RejectedEmails -MinutesBack $HistoryMinutes

                    if ($traces.Count -gt 0) {
                        Write-Success "`n🔔 Found $($traces.Count) rejected email(s) at $(Get-Date -Format 'HH:mm:ss')"

                        foreach ($trace in $traces) {
                            Write-Info "  → $($trace.Subject) to $($trace.RecipientAddress)"

                            $emailData = @{
                                MessageId = $trace.MessageId
                                From = $trace.SenderAddress
                                To = $trace.RecipientAddress
                                Subject = $trace.Subject
                                Timestamp = $trace.Received
                            }

                            Send-ToCdsWebhook -EmailData $emailData -WebhookUrl $CdsWebhookUrl
                        }
                    } else {
                        Write-Info "[$(Get-Date -Format 'HH:mm:ss')] Monitoring... (no rejections detected)"
                    }

                    $lastCheck = Get-Date
                    Start-Sleep -Seconds $PollIntervalSeconds
                } catch {
                    Write-Error-Custom "Monitor error: $_"
                    Start-Sleep -Seconds $PollIntervalSeconds
                }
            }
        }
    }

    Write-Info "`n✅ Bridge operation complete"
}

# Run
Main
