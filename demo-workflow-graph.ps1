################################################################################
# Clinical Data Sentinel - Demo Workflow (Graph Edition)
# =========================================================================
# October 16, 2026, 11:00 AM IST - Jury Presentation
# Real-time M365 email rejection detection via Microsoft Graph API
################################################################################

Write-Host "`n" -ForegroundColor Cyan
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Clinical Data Sentinel - Demo Workflow (Graph Edition)        ║" -ForegroundColor Cyan
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

# Step 3: Check CDS Production Server
Write-Host "`n[STEP 3] Checking CDS Production Server..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "https://cds.kloudeai.xyz/api/incidents" -Method Get -ErrorAction Stop
    $incidents = $response.Content | ConvertFrom-Json
    Write-Host "✅ CDS Production is running at cds.kloudeai.xyz" -ForegroundColor Green
    Write-Host "   Current incidents: $($incidents.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ CDS Production is not responding" -ForegroundColor Red
    Write-Host "   URL: https://cds.kloudeai.xyz/api/incidents" -ForegroundColor Yellow
    Write-Host "   Please verify Railway.app deployment" -ForegroundColor Yellow
    exit 1
}

# Step 4: Check Graph Configuration
Write-Host "`n[STEP 4] Checking Graph Configuration..." -ForegroundColor Yellow

$configPath = "$env:USERPROFILE\cds-bridge-config.json"

if (-not (Test-Path $configPath)) {
    Write-Host "❌ Graph config not found: $configPath" -ForegroundColor Red
    Write-Host "   Please complete GRAPH-WEBHOOK-SETUP.md Steps 1-2" -ForegroundColor Yellow
    Write-Host "   This will create the config file with your Azure AD credentials" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✅ Graph config found at: $configPath" -ForegroundColor Green

    try {
        $config = Get-Content $configPath | ConvertFrom-Json
        Write-Host "   Tenant: $($config.tenantId)" -ForegroundColor Cyan
        Write-Host "   App: $($config.clientId)" -ForegroundColor Cyan
        Write-Host "   Webhook: $($config.cdsWebhookUrl)" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ Failed to parse config file: $_" -ForegroundColor Red
        exit 1
    }
}

# Step 5: Start Graph Webhook Listener
Write-Host "`n[STEP 5] Starting Graph Webhook Listener..." -ForegroundColor Yellow
Write-Host "Listener will monitor for rejected emails in real-time" -ForegroundColor Cyan
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🟢 DEMO READY - All systems online" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 NEXT STEPS FOR JURY DEMO:" -ForegroundColor Yellow
Write-Host "  1. Open CDS Production: https://cds.kloudeai.xyz" -ForegroundColor Cyan
Write-Host "  2. Note current incident count" -ForegroundColor Cyan
Write-Host "  3. Open Outlook and send test email:" -ForegroundColor Cyan
Write-Host "     - To: external@gmail.com (or any external email)" -ForegroundColor Cyan
Write-Host "     - Subject: 'Patient discharge with MRN-2024-DEMO'" -ForegroundColor Cyan
Write-Host "     - Body: Include MRN, DOB, SSN, Aadhar numbers" -ForegroundColor Cyan
Write-Host "  4. Watch production dashboard - incident appears in real-time 🎯" -ForegroundColor Cyan
Write-Host "  5. Click incident to review AI analysis and PHI detected" -ForegroundColor Cyan
Write-Host "  6. Click GREEN button (RELEASE) to approve and send" -ForegroundColor Cyan
Write-Host "  7. Open M365 Message Trace to confirm DELIVERED" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔴 IMPORTANT: Keep this listener running in background" -ForegroundColor Red
Write-Host "   It monitors for rejected emails via Graph API in real-time" -ForegroundColor Red
Write-Host ""
Write-Host "Press Ctrl+C to stop (after demo completes)" -ForegroundColor Yellow
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# Start listening
Write-Host "`n[BRIDGE] Starting Graph webhook listener..." -ForegroundColor Cyan

& ".\graph-webhook-listener.ps1" -ConfigPath $configPath
