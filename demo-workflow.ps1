################################################################################
# Clinical Data Sentinel - Demo Workflow (October 16, 11 AM)
# =========================================================================
# One-script setup for the jury presentation
# Usage: .\demo-workflow.ps1
################################################################################

Write-Host "`n" -ForegroundColor Cyan
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Clinical Data Sentinel - Demo Workflow                        ║" -ForegroundColor Cyan
Write-Host "║  Jury Presentation - October 16, 2026, 11:00 AM IST           ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Exchange Online Connection
Write-Host "[STEP 1] Checking Exchange Online Connection..." -ForegroundColor Yellow

try {
    $session = Get-ExchangeOnlineSession -ErrorAction Stop
    Write-Host "✅ Connected to Exchange Online" -ForegroundColor Green
} catch {
    Write-Host "❌ Not connected. Attempting connection..." -ForegroundColor Red

    # Try with WAM disabled
    $env:MSAL_NET_DISABLE_WAM = "true"

    try {
        Connect-ExchangeOnline -ErrorAction Stop
        Write-Host "✅ Connected to Exchange Online (WAM disabled)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to connect to Exchange Online" -ForegroundColor Red
        Write-Host "   Please run: Connect-ExchangeOnline" -ForegroundColor Yellow
        exit 1
    }
}

# Step 2: Verify Transport Rule
Write-Host "`n[STEP 2] Verifying Transport Rule..." -ForegroundColor Yellow

try {
    $rule = Get-TransportRule -Identity "CDS-PHI-Detection-External" -ErrorAction Stop

    if ($rule.State -eq "Enabled") {
        Write-Host "✅ Transport Rule 'CDS-PHI-Detection-External' is ENABLED" -ForegroundColor Green
        Write-Host "   Priority: $($rule.Priority)" -ForegroundColor Cyan
        Write-Host "   Status: $($rule.State)" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  Transport Rule exists but is DISABLED" -ForegroundColor Yellow
        Write-Host "   Enabling rule..." -ForegroundColor Yellow
        Enable-TransportRule -Identity "CDS-PHI-Detection-External"
        Write-Host "✅ Transport Rule enabled" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Transport Rule not found: $_" -ForegroundColor Red
    Write-Host "   Please create the transport rule first. See TRANSPORT-RULE-SETUP.md" -ForegroundColor Yellow
    exit 1
}

# Step 3: Check CDS Server
Write-Host "`n[STEP 3] Checking CDS Server Status..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/incidents" -Method Get -ErrorAction Stop
    Write-Host "✅ CDS Server is running on port 5000" -ForegroundColor Green
    Write-Host "   Incidents in database: $($response.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ CDS Server is not running" -ForegroundColor Red
    Write-Host "   Please start the server:" -ForegroundColor Yellow
    Write-Host "   cd /home/claude/clinical-data-sentinel && npm start" -ForegroundColor Yellow
    exit 1
}

# Step 4: Test Webhook
Write-Host "`n[STEP 4] Testing Webhook..." -ForegroundColor Yellow

$testPayload = @{
    messageId = "DEMO-$(Get-Date -Format 'yyyyMMddHHmmss')"
    from = "demo@hospital.com"
    to = "external@demo.com"
    subject = "Demo email with MRN-2024-TEST and DOB 15/03/1985"
    body = "This is a test email. MRN: 2024-TEST, DOB: 15/03/1985, Aadhar: 123456789012"
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "http://localhost:5000/api/webhook/check-email-safety" -Method Post -ContentType "application/json" -Body $testPayload -ErrorAction Stop
    Write-Host "✅ Webhook is responding" -ForegroundColor Green
    Write-Host "   Risk Level: $($result.risk_level)" -ForegroundColor Cyan
    Write-Host "   Confidence: $($result.confidence)%" -ForegroundColor Cyan
    Write-Host "   PHI Detected: $($result.phi_detected -join ', ')" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Webhook test failed: $_" -ForegroundColor Red
    exit 1
}

# Step 5: Start Bridge in Monitor Mode
Write-Host "`n[STEP 5] Starting Webhook Bridge (Monitor Mode)..." -ForegroundColor Yellow
Write-Host "Bridge will monitor for rejected emails every 5 seconds" -ForegroundColor Cyan
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🟢 DEMO READY - All systems online" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 NEXT STEPS FOR JURY DEMO:" -ForegroundColor Yellow
Write-Host "  1. Open CDS Portal: http://localhost:5000 in browser" -ForegroundColor Cyan
Write-Host "  2. Show empty dashboard (refresh if needed)" -ForegroundColor Cyan
Write-Host "  3. Open Outlook and send test email:" -ForegroundColor Cyan
Write-Host "     - To: external@gmail.com (or any external email)" -ForegroundColor Cyan
Write-Host "     - Subject: 'Patient discharge with MRN-2024-DEMO'" -ForegroundColor Cyan
Write-Host "     - Body: Include MRN, DOB, SSN, or Aadhar number" -ForegroundColor Cyan
Write-Host "  4. Watch dashboard - incident appears in ~5 seconds ⏱️" -ForegroundColor Cyan
Write-Host "  5. Click incident to see AI analysis" -ForegroundColor Cyan
Write-Host "  6. Click GREEN button (RELEASE) to approve and send" -ForegroundColor Cyan
Write-Host "  7. Open M365 Message Trace to confirm DELIVERED" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔴 IMPORTANT: Keep this script running in background" -ForegroundColor Red
Write-Host "   It monitors Exchange every 5 seconds for rejected emails" -ForegroundColor Red
Write-Host ""
Write-Host "Press Ctrl+C to stop monitoring (after demo)" -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# Start monitoring
Write-Host "`n[BRIDGE] Starting continuous monitoring..." -ForegroundColor Cyan

& ".\transport-rule-webhook-bridge.ps1" -Mode Monitor -PollIntervalSeconds 5 -CdsWebhookUrl "http://localhost:5000/api/webhook/check-email-safety"
