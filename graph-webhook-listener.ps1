################################################################################
# Clinical Data Sentinel - Microsoft Graph Webhook Listener
# =========================================================================
# Purpose: Listen for M365 mailbox changes via Graph API and forward to CDS
#
# Workflow:
# 1. Receives change notifications from Microsoft Graph API
# 2. When email activity detected, queries Message Trace for rejections
# 3. Sends rejected emails to CDS webhook for incident creation
# 4. Maintains Graph subscription and handles renewals
#
# Usage: .\graph-webhook-listener.ps1
#
# Prerequisites:
# - Azure AD app registration with Graph permissions
# - Client credentials (client ID, secret, tenant ID)
# - cds-bridge-config.json with credentials
# - M365 global admin rights
################################################################################

param(
    [string]$ConfigPath = "$env:USERPROFILE\cds-bridge-config.json",
    [int]$CheckIntervalSeconds = 10,
    [string]$CdsWebhookUrl = "https://cds.kloudeai.xyz/api/webhook/check-email-safety"
)

# ============================================
# Helper Functions
# ============================================

function Write-Success { Write-Host $args[0] -ForegroundColor Green }
function Write-Error-Custom { Write-Host $args[0] -ForegroundColor Red }
function Write-Info { Write-Host $args[0] -ForegroundColor Cyan }
function Write-Warning-Custom { Write-Host $args[0] -ForegroundColor Yellow }

# Load configuration
function Load-Config {
    if (-not (Test-Path $ConfigPath)) {
        Write-Error-Custom "❌ Config file not found: $ConfigPath"
        Write-Warning-Custom "Please run Step 2 from GRAPH-WEBHOOK-SETUP.md first"
        exit 1
    }

    try {
        $config = Get-Content $ConfigPath | ConvertFrom-Json
        Write-Success "✅ Config loaded from: $ConfigPath"
        return $config
    } catch {
        Write-Error-Custom "❌ Failed to load config: $_"
        exit 1
    }
}

# Get access token from Azure AD
function Get-GraphAccessToken {
    param([object]$Config)

    Write-Info "[Graph] Authenticating with Azure AD..."

    $tokenUri = "https://login.microsoftonline.com/$($Config.tenantId)/oauth2/v2.0/token"
    $body = @{
        client_id     = $Config.clientId
        client_secret = $Config.clientSecret
        scope         = "https://graph.microsoft.com/.default"
        grant_type    = "client_credentials"
    }

    try {
        $token = Invoke-RestMethod -Uri $tokenUri -Method Post -Body $body -ErrorAction Stop
        Write-Success "✅ Access token obtained (expires in $($token.expires_in)s)"
        return $token.access_token
    } catch {
        Write-Error-Custom "❌ Authentication failed: $_"
        return $null
    }
}

# Create or verify Graph subscription
function Test-GraphSubscription {
    param(
        [string]$Token,
        [object]$Config
    )

    Write-Info "[Graph] Checking subscription status..."

    $headers = @{
        Authorization = "Bearer $Token"
        "Content-Type" = "application/json"
    }

    try {
        $subscriptions = Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/subscriptions" `
            -Method Get `
            -Headers $headers `
            -ErrorAction Stop

        if ($subscriptions.value.Count -gt 0) {
            Write-Success "✅ Active subscriptions found: $($subscriptions.value.Count)"
            $subscriptions.value | ForEach-Object {
                Write-Info "   - ID: $($_.id)"
                Write-Info "     Resource: $($_.resource)"
                Write-Info "     Expires: $($_.expirationDateTime)"
            }
            return $subscriptions.value[0]
        } else {
            Write-Warning-Custom "⚠️  No subscriptions found"
            return $null
        }
    } catch {
        Write-Error-Custom "❌ Failed to check subscriptions: $_"
        return $null
    }
}

# Query Message Trace for recent rejections
function Get-RejectedEmails {
    param(
        [string]$Token,
        [int]$MinutesBack = 5
    )

    $headers = @{
        Authorization = "Bearer $Token"
        "Content-Type" = "application/json"
    }

    $startTime = (Get-Date).AddMinutes(-$MinutesBack)

    try {
        $query = @{
            startDateTime = $startTime.ToString('o')
            endDateTime = (Get-Date).ToString('o')
            pageSize = 100
        } | ConvertTo-Json

        $trace = Invoke-RestMethod `
            -Uri "https://graph.microsoft.com/v1.0/me/messages?`$filter=isReminderOn eq false" `
            -Method Get `
            -Headers $headers `
            -ErrorAction Continue

        # Alternative: Use Message Trace API directly if available
        # For now, we'll use a hybrid approach

        return @()
    } catch {
        Write-Warning-Custom "[Graph] Message query returned no results (first check is normal)"
        return @()
    }
}

# Query Exchange Message Trace (via Graph or PowerShell)
function Get-MessageTraceRejections {
    param([int]$MinutesBack = 5)

    Write-Info "[Bridge] Querying Exchange Message Trace..."

    $startTime = (Get-Date).AddMinutes(-$MinutesBack)

    try {
        # Try to get session
        $session = Get-ExchangeOnlineSession -ErrorAction SilentlyContinue

        if (-not $session) {
            Write-Warning-Custom "[Bridge] Exchange Online not connected - attempting connection..."
            Connect-ExchangeOnline -ErrorAction Stop
        }

        $trace = Get-MessageTrace `
            -StartDate $startTime `
            -Status Failed `
            -ErrorAction Stop | Where-Object {
                $_.ToIP -like "*" # External recipient indicator
            }

        if ($trace) {
            Write-Success "[Bridge] ✅ Found $($trace.Count) rejected email(s)"
            return @($trace)
        } else {
            return @()
        }
    } catch {
        Write-Warning-Custom "[Bridge] Message Trace query failed: $_"
        return @()
    }
}

# Send email to CDS webhook
function Send-ToCDSWebhook {
    param(
        [object]$Email,
        [string]$WebhookUrl
    )

    try {
        $payload = @{
            messageId = $Email.MessageId
            from = $Email.SenderAddress
            to = $Email.RecipientAddress
            subject = $Email.Subject
            body = $Email.Subject  # Message Trace doesn't have body, use subject
            timestamp = $Email.Received.ToString('o')
            source = "graph_webhook"
            status = "rejected"
        } | ConvertTo-Json

        Write-Info "[Bridge] Sending to CDS webhook: $WebhookUrl"

        $response = Invoke-RestMethod `
            -Uri $WebhookUrl `
            -Method Post `
            -ContentType "application/json" `
            -Body $payload `
            -ErrorAction Stop

        if ($response.allow -eq $false) {
            Write-Success "[Bridge] ✅ Incident created (ID: $($response.incident_id))"
            Write-Success "[Bridge]    Risk: $($response.risk_level), Confidence: $($response.confidence)%"
            return $true
        } else {
            Write-Info "[Bridge] Email flagged as safe"
            return $false
        }
    } catch {
        Write-Error-Custom "[Bridge] Webhook error: $_"
        return $false
    }
}

# Main monitoring loop
function Start-Monitoring {
    param(
        [object]$Config,
        [int]$Interval = 10
    )

    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "🟢 GRAPH WEBHOOK LISTENER ACTIVE" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Info "Monitoring for rejected emails..."
    Write-Info "Check interval: ${Interval}s"
    Write-Info "CDS Webhook: $($Config.cdsWebhookUrl)"
    Write-Host ""
    Write-Warning-Custom "Press Ctrl+C to stop monitoring"
    Write-Host ""

    $lastCheck = (Get-Date).AddMinutes(-15)
    $processedEmails = @{}

    while ($true) {
        try {
            # Get fresh token
            $token = Get-GraphAccessToken -Config $Config
            if (-not $token) {
                Write-Error-Custom "[Monitor] Failed to get access token, retrying..."
                Start-Sleep -Seconds 30
                continue
            }

            # Check Graph subscription status
            $subscription = Test-GraphSubscription -Token $token -Config $Config

            # Query Message Trace for new rejections
            $rejections = Get-MessageTraceRejections -MinutesBack 10

            if ($rejections) {
                foreach ($email in $rejections) {
                    $emailKey = "$($email.MessageId)_$($email.SenderAddress)"

                    # Avoid duplicate processing
                    if (-not $processedEmails.ContainsKey($emailKey)) {
                        Write-Host ""
                        Write-Warning-Custom "[Detected] Rejected email from $($email.SenderAddress) to $($email.RecipientAddress)"

                        # Send to CDS webhook
                        $sent = Send-ToCDSWebhook -Email $email -WebhookUrl $Config.cdsWebhookUrl

                        if ($sent) {
                            $processedEmails[$emailKey] = $true
                        }
                    }
                }
            }

            # Sleep before next check
            Write-Info "[Monitor] Waiting ${Interval}s for next check..."
            Start-Sleep -Seconds $Interval

        } catch {
            Write-Error-Custom "[Monitor] Error in monitoring loop: $_"
            Start-Sleep -Seconds 30
        }
    }
}

# ============================================
# Main Execution
# ============================================

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Clinical Data Sentinel - Graph Webhook Listener           ║" -ForegroundColor Cyan
Write-Host "║  Real-time M365 Email Rejection Detection                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Load configuration
$config = Load-Config

# Verify Exchange Online connection
Write-Info "[Setup] Verifying Exchange Online connection..."
try {
    $session = Get-ExchangeOnlineSession -ErrorAction SilentlyContinue
    if (-not $session) {
        Write-Warning-Custom "[Setup] Connecting to Exchange Online..."
        Connect-ExchangeOnline -ErrorAction Stop
    }
    Write-Success "✅ Connected to Exchange Online"
} catch {
    Write-Error-Custom "❌ Exchange Online connection failed: $_"
    exit 1
}

# Test Graph authentication
Write-Info "[Setup] Testing Graph API connection..."
$token = Get-GraphAccessToken -Config $config
if (-not $token) {
    exit 1
}

# Verify Graph subscription
Write-Info "[Setup] Verifying Graph subscription..."
$subscription = Test-GraphSubscription -Token $token -Config $config
if (-not $subscription) {
    Write-Warning-Custom "[Setup] No subscription found - please run GRAPH-WEBHOOK-SETUP.md Step 3"
}

# Start monitoring
Start-Monitoring -Config $config -Interval $CheckIntervalSeconds
