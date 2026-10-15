# Transport Rule → Webhook Bridge Integration Guide

## Problem Statement

M365 Exchange Transport Rules can **reject emails** but **cannot directly call webhooks**. This creates a gap:

```
EMAIL WITH PHI → Transport Rule (REJECTS) ❌ → Webhook NOT CALLED
                                              → CDS Portal EMPTY
```

## Solution: PowerShell Bridge

We bridge the gap by querying M365 message trace for rejected emails and forwarding them to the CDS webhook.

```
EMAIL WITH PHI → Transport Rule (REJECTS) → PowerShell Bridge → CDS Webhook
                                           (polls message trace)   (creates incident)
                                                                   → Admin Reviews
                                                                   → RELEASE or REJECT
```

---

## Architecture

### Components

1. **M365 Transport Rule** - Rejects emails with PHI to external recipients
   - Status: ✅ Already created and enabled
   - Action: Rejects email (holds in Exchange)
   - Logs: Appears in M365 Message Trace with Status="Failed"

2. **CDS Webhook** - Analyzes emails and creates incidents
   - Endpoint: `POST /api/webhook/check-email-safety`
   - Status: ✅ Working and tested
   - Database: Stores incidents with status='transport_hold'

3. **PowerShell Bridge** - Queries rejected emails and sends to webhook
   - Script: `transport-rule-webhook-bridge.ps1`
   - Modes: Once, Test, Monitor (continuous)
   - Polls: Every 10 seconds for new rejections

### Data Flow

```
M365 Exchange
│
├─ Email: doctor→patient@gmail.com (contains MRN)
│
├─ Transport Rule "CDS-PHI-Detection-External"
│   └─ Action: Reject (Status="Failed" in message trace)
│
├─ Message Trace
│   └─ Shows rejection with error
│
PowerShell Bridge
│
├─ Query: Get-MessageTrace (last 5 minutes)
│   └─ Filter: Status="Failed" AND ErrorType="TransportRuleReject"
│
├─ Extract: SenderAddress, RecipientAddress, Subject, MessageId
│
├─ POST to CDS Webhook
│   └─ URL: http://localhost:5000/api/webhook/check-email-safety
│   └─ Payload: { from, to, subject, body, messageId }
│
CDS Portal
│
├─ Incident Created (status='transport_hold')
│   └─ Email_ID: Message ID
│   └─ From: SenderAddress
│   └─ To: RecipientAddress
│   └─ PHI Detected: [MRN, DOB, etc.]
│   └─ Risk Level: [safe/review/anomalous]
│   └─ Confidence: 61%-95%
│
├─ Admin Actions
│   ├─ ✅ RELEASE: Admin approves email to be sent
│   ├─ ❌ REJECT: Admin blocks email (stays rejected)
│   └─ 🔍 REVIEW: Admin notes and escalates
```

---

## Setup Instructions

### Step 1: Exchange Online Connection

```powershell
# Connect to Exchange Online (if not already connected)
Connect-ExchangeOnline -Credential (Get-Credential)

# Disable WAM if you encounter auth errors
$env:MSAL_NET_DISABLE_WAM = "true"
Connect-ExchangeOnline
```

### Step 2: Verify Transport Rule Exists

```powershell
# List all transport rules
Get-TransportRule | Select-Object Name, State, Priority | Format-Table

# Verify CDS rule is enabled
Get-TransportRule -Identity "CDS-PHI-Detection-External" | Select-Object Name, State, RejectMessageReasonText
```

Expected output:
```
Name: CDS-PHI-Detection-External
State: Enabled
```

### Step 3: Start CDS Server (Webhook Listener)

In Node.js terminal:
```bash
cd /home/claude/clinical-data-sentinel
npm install
npm start

# Expected output:
# ╔════════════════════════════════════════════════════════════╗
# ║  Clinical Data Sentinel - Backend Service (ENHANCED)       ║
# ║  Running on http://localhost:5000                            ║
# ╚════════════════════════════════════════════════════════════╝
```

### Step 4: Start PowerShell Bridge

In PowerShell terminal (must be connected to Exchange Online):

**Option A: Monitor Continuously**
```powershell
.\transport-rule-webhook-bridge.ps1 -Mode Monitor -CdsWebhookUrl "http://localhost:5000/api/webhook/check-email-safety"
```

**Option B: Test Once**
```powershell
.\transport-rule-webhook-bridge.ps1 -Mode Test -CdsWebhookUrl "http://localhost:5000/api/webhook/check-email-safety"
```

**Option C: Check Last 5 Minutes**
```powershell
.\transport-rule-webhook-bridge.ps1 -Mode Once -CdsWebhookUrl "http://localhost:5000/api/webhook/check-email-safety" -HistoryMinutes 5
```

### Step 5: Test the Workflow

#### Manual Webhook Test (Verify Bridge Works)

```powershell
$testEmail = @{
    messageId = "TEST-$(Get-Date -Format 'yyyyMMddHHmmss')"
    from = "doctor@hospital.com"
    to = "patient@external.com"
    subject = "Patient records with MRN-2024-98765 and DOB 15/03/1985"
    body = "MRN: 2024-98765, DOB: 15/03/1985, Aadhar: 234567891234"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:5000/api/webhook/check-email-safety" `
    -Method Post `
    -ContentType "application/json" `
    -Body $testEmail
```

Expected output:
```json
{
  "allow": false,
  "incident_id": 1,
  "risk_level": "anomalous",
  "confidence": 95,
  "phi_detected": ["mrn", "dob", "aadhar"],
  "action": "⏸️ HELD FOR ADMIN REVIEW"
}
```

#### Real Email Test (With Transport Rule)

1. Open Outlook (as doctor or test user)
2. Send email to external Gmail address
3. Subject: "Patient records with MRN-2024-98765"
4. Body: Include MRN, DOB, SSN, Aadhar, or Policy number
5. Send
6. Email will be rejected by transport rule
7. Wait 5-10 seconds for bridge to poll

### Step 6: Verify in CDS Portal

Open browser: `http://localhost:5000`

Check Dashboard:
- ✅ "TOTAL SCANNED" should show incident count
- ✅ "Incidents captured" list should appear
- ✅ Risk level badge (🔴 Anomalous, 🟡 Review, 🟢 Safe)

Click incident to see:
- Sender email
- Recipient email
- Subject
- PHI types detected (MRN, DOB, SSN, etc.)
- Confidence score
- Action buttons: RELEASE / REJECT / REVIEW

---

## Usage Modes

### Monitor Mode (Continuous)

Runs continuously, polling every 10 seconds for new rejections.

```powershell
.\transport-rule-webhook-bridge.ps1 -Mode Monitor
```

**Output:**
```
[14:30:15] Monitoring... (no rejections detected)
[14:30:25] Monitoring... (no rejections detected)
[14:30:35] Monitoring... (no rejections detected)
[14:30:40] 🔔 Found 1 rejected email(s) at 14:30:40
  → Patient records to external@gmail.com
  ✅ Incident created (incident_id: 42)
     Risk: anomalous, Confidence: 95%
```

**Control:**
- Press Ctrl+C to stop monitoring
- Keep running in background (recommended for production)

### Test Mode

Sends a test email payload to webhook to verify bridge works.

```powershell
.\transport-rule-webhook-bridge.ps1 -Mode Test
```

**Output:**
```
[Bridge] Sending to CDS webhook: http://localhost:5000/api/webhook/check-email-safety
[Bridge] Payload: {
  "messageId": "TEST-20241015143040",
  "from": "doctor@hospital.com",
  "to": "patient@external.com",
  "subject": "Test Email with MRN-2024-98765 and DOB: 15/03/1985",
  ...
}
✅ Incident created (incident_id: 42)
   Risk: anomalous, Confidence: 95%
```

### Once Mode

Queries last N minutes for rejected emails and syncs them (one-time).

```powershell
.\transport-rule-webhook-bridge.ps1 -Mode Once -HistoryMinutes 10
```

**Usage:** Backfill incidents from emails rejected in the last 10 minutes.

---

## Webhook Request/Response Format

### Request

```json
{
  "messageId": "CADc-_xdB6+K7gQ3vL2nP=@mail.gmail.com",
  "from": "doctor@hospital.com",
  "to": "patient@external.com",
  "subject": "Patient discharge summary - MRN 2024-98765",
  "body": "Patient: John Doe, MRN: 2024-98765, DOB: 15/03/1985, SSN: 123-45-6789",
  "timestamp": "2026-10-15T15:05:40Z",
  "source": "transport_rule"
}
```

### Response (High-Risk PHI)

```json
{
  "allow": false,
  "incident_id": 42,
  "risk_level": "anomalous",
  "confidence": 95,
  "phi_detected": ["mrn", "dob", "ssn"],
  "action": "⏸️ HELD FOR ADMIN REVIEW",
  "timestamp": "2026-10-15T15:05:40Z"
}
```

### Response (Safe / Internal)

```json
{
  "allow": true,
  "incident_id": null,
  "risk_level": "safe",
  "confidence": 15,
  "phi_detected": [],
  "action": "✅ ALLOWED",
  "timestamp": "2026-10-15T15:05:40Z"
}
```

---

## Admin Workflow

### 1. Incident Appears in Portal

When rejected email is synced via webhook:

```
[Portal Shows]
Dashboard
├─ Total Scanned: 1
├─ Incident #42
│  ├─ From: doctor@hospital.com
│  ├─ To: patient@external.com
│  ├─ Subject: Patient discharge summary - MRN 2024-98765
│  ├─ Risk: 🔴 ANOMALOUS (95% confidence)
│  ├─ PHI: MRN, DOB, SSN
│  └─ Status: ⏸️ HELD FOR ADMIN REVIEW
```

### 2. Admin Reviews and Decides

```
Actions Available:
├─ ✅ RELEASE
│  └─ Admin clicks GREEN button
│  └─ Email is sent to external recipient
│  └─ Action logged: "Released by admin@hospital.com at 2026-10-15 15:06:00"
│  └─ Status shown in M365 Message Trace: DELIVERED
│
├─ ❌ REJECT
│  └─ Admin clicks RED button
│  └─ Email stays rejected (never sent)
│  └─ Action logged: "Rejected by admin@hospital.com - Policy violation"
│  └─ Status shown in M365 Message Trace: FAILED (Transport rule)
│
└─ 🔍 REVIEW
   └─ Admin adds note for security team
   └─ Escalates for investigation
```

### 3. Verify in M365 Message Trace

```powershell
# Check message delivery/rejection status
Get-MessageTrace -StartDate (Get-Date).AddHours(-1) | Select-Object SenderAddress, RecipientAddress, Status, ErrorType | Format-Table

# Output should show:
# doctor@hospital.com → patient@external.com  DELIVERED  [if RELEASED]
# doctor@hospital.com → patient@external.com  FAILED     [if REJECTED]
```

---

## Compliance & Audit Trail

### Incident Record

```
Incident #42
├─ Created At: 2026-10-15 15:05:40
├─ Email ID: CADc-_xdB6+K7gQ3vL2nP=@mail.gmail.com
├─ From: doctor@hospital.com
├─ To: patient@external.com
├─ PHI Types: MRN, DOB, SSN
├─ Confidence: 95%
├─ Risk Level: anomalous
├─ DPDP Article: Article 8 (Technical Measures)
├─ NABH Standard: Standard 2.3 (Patient Data Protection)
│
└─ Action History
   ├─ 15:05:40 - Incident created (source: transport_rule)
   ├─ 15:06:15 - RELEASED by admin@hospital.com
   │           - Reason: "Legitimate discharge summary"
   │           - Message sent at: 15:06:16
   │           - Delivery status: DELIVERED
   │           - M365 Message Trace: https://admin.microsoft.com/.../message-trace
```

### Regulatory Evidence

For audits and compliance investigations:

```
DPDP Article 8: Technical & Organizational Measures ✅
├─ Real-time detection of PHI
├─ Incident logging with timestamps
├─ Admin approval required before sending
├─ Complete audit trail of all actions
├─ Message trace verification

NABH Standard 2.3: Patient Data Protection ✅
├─ Access control (admin approval)
├─ Incident response (immediate notification)
├─ Documentation (audit trail)
├─ Technical measures (webhook + transport rule)
```

---

## Troubleshooting

### Issue: "Not connected to Exchange Online"

**Solution:**
```powershell
# Connect to Exchange Online
Connect-ExchangeOnline -Credential (Get-Credential)

# If you get WAM errors:
$env:MSAL_NET_DISABLE_WAM = "true"
Connect-ExchangeOnline
```

### Issue: "Bridge finds no rejected emails"

**Possible causes:**
1. Transport rule is disabled
   ```powershell
   Enable-TransportRule -Identity "CDS-PHI-Detection-External"
   ```

2. No emails sent to external recipients since last check
   ```powershell
   # Send test email from Outlook
   # To: patient@gmail.com (external)
   # Subject: Test with MRN-2024-98765
   ```

3. Message trace not populated yet (delay up to 5 minutes)
   ```powershell
   # Check if recent messages appear
   Get-MessageTrace -StartDate (Get-Date).AddMinutes(-5) | Select-Object SenderAddress, Subject, Status
   ```

### Issue: Webhook returns error

**Check server logs:**
```bash
ps aux | grep node  # Verify server is running
curl http://localhost:5000/api/incidents  # Test API
tail -50 /tmp/cds-server.log  # Check server logs
```

### Issue: Incident not appearing in portal

**Verify webhook call succeeded:**
```powershell
# Check server logs for webhook calls
Invoke-RestMethod -Uri "http://localhost:5000/api/webhook/check-email-safety" -Method Post -ContentType "application/json" -Body (@{
    messageId = "TEST-123"
    from = "test@hospital.com"
    to = "test@gmail.com"
    subject = "Test with MRN-2024-99999"
    body = "MRN: 2024-99999"
} | ConvertTo-Json)
```

---

## Performance & Scaling

### Default Polling Interval: 10 seconds

For production deployment with multiple servers:

```powershell
# Faster polling (more responsive)
.\transport-rule-webhook-bridge.ps1 -Mode Monitor -PollIntervalSeconds 5

# Slower polling (reduces Exchange API calls)
.\transport-rule-webhook-bridge.ps1 -Mode Monitor -PollIntervalSeconds 30

# Larger history window (catch missed emails)
.\transport-rule-webhook-bridge.ps1 -Mode Monitor -HistoryMinutes 15
```

### Recommended Configuration for Demo (Oct 16, 11 AM)

```powershell
# Terminal 1: Keep bridge running in Monitor mode
.\transport-rule-webhook-bridge.ps1 -Mode Monitor -PollIntervalSeconds 5
```

This will catch any rejected emails within 5 seconds, showing live demo flow:
1. Send test email
2. Email rejected by transport rule
3. Bridge picks up rejection (within 5 seconds)
4. Incident appears in portal
5. Admin clicks RELEASE
6. Verify in M365 Message Trace: DELIVERED

---

## Complete Demo Script (For Jury)

```powershell
# Terminal 1: Exchange Online Connection + Bridge
Connect-ExchangeOnline
.\transport-rule-webhook-bridge.ps1 -Mode Monitor -PollIntervalSeconds 5

# Terminal 2 (Demo): Open CDS Portal
# Browser: http://localhost:5000

# Demo Steps:
# 1. Show empty dashboard (no incidents)
# 2. Open Outlook, send email with MRN to external@gmail.com
# 3. Watch dashboard - incident appears in ~5 seconds
# 4. Click incident, show AI analysis
# 5. Admin clicks RELEASE
# 6. Check M365 Message Trace - shows DELIVERED
```

---

## Next Steps

1. ✅ Transport rule created and enabled
2. ✅ CDS webhook tested and working
3. ✅ PowerShell bridge created and ready
4. **→ Run bridge in Monitor mode for demo**
5. **→ Send test emails and verify workflow**
6. **→ Capture screenshots for jury presentation**
7. **→ Verify message traces show delivery confirmation**

---

## Support

For issues or questions:
1. Check troubleshooting section above
2. Verify all 3 components running (Exchange, CDS server, PowerShell bridge)
3. Test webhook manually with curl/Invoke-RestMethod
4. Check server logs: `/tmp/cds-server.log`
5. Verify transport rule exists: `Get-TransportRule | Select-Object Name`
