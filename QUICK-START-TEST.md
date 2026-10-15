# Quick Start - Test Transport Rule Workflow (30 minutes)

## What You're Testing
✅ Email with PHI sent to external → CDS detects → Admin approves/blocks → Message trace confirms

---

## Prerequisites Checklist

- [ ] Node.js + npm installed
- [ ] M365 tenant with Exchange Online access
- [ ] PowerShell with ExchangeOnlineManagement module
- [ ] CDS repository cloned and ready

---

## 5-Minute Setup

### 1. Install Dependencies
```bash
cd clinical-data-sentinel
npm install
```

### 2. Start CDS Server
```bash
npm start
# Server runs at http://localhost:5000
# Dashboard at http://localhost:5000/dashboard
```

### 3. In New Terminal - Run Transport Rule Test
```bash
cd clinical-data-sentinel
node test-transport-rule.js
```

**Expected Output:**
```
╔═══════════════════════════════════════════════════════════════════════════════╗
║          CLINICAL DATA SENTINEL - TRANSPORT RULE WEBHOOK TEST SUITE            ║
║                                                                               ║
║ Testing the DLP/Transport Rule email quarantine and admin approval workflow   ║
║ Email hold → Admin review in portal → Release/Reject decision                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Test: PHI to External - HIGH RISK (Should HOLD)
From: doctor.john@hospital.local
To: patient@gmail.com
Subject: Patient Medical Records - URGENT

Webhook Response:
  Action: ⏸️ HELD FOR ADMIN REVIEW
  Allow: NO
  Risk Level: ANOMALOUS
  Confidence: 95%
  PHI Detected: Aadhar, MRN, DOB, Phone, Policy #
  Incident ID: 1
```

---

## 10-Minute Portal Testing

### 1. Open CDS Dashboard
```
http://localhost:5000/dashboard
```

### 2. You Should See
- 📋 **Incidents Tab** - 3 test emails listed
  - 1 ANOMALOUS (PHI to external) - HELD
  - 1 REVIEW (MRN to external) - HELD
  - 1 SAFE (internal) - ALLOWED

### 3. Click on HELD Email
- Review AI analysis
- Check confidence score
- See compliance violations (DPDP Article 8)

### 4. Test RELEASE Action
- Click "Release to Send" button
- Status changes to "released"
- See success message with email details

### 5. Test REJECT Action
- Click "Reject (Don't Send)" button
- Status changes to "rejected"
- See block confirmation message

### 6. Check Analytics Tab
- Blocked Incidents count increases
- PHI Types breakdown shows detected patterns
- External Recipients percentage visible

---

## 10-Minute M365 Real Test (Optional but Recommended)

### 1. Connect to Exchange Online
```powershell
Install-Module -Name ExchangeOnlineManagement -Force
Connect-ExchangeOnline -UserPrincipalName your-admin@yourtenant.onmicrosoft.com
```

### 2. Create Transport Rule (Copy from TRANSPORT-RULE-SETUP.md)
```powershell
# Simplified test rule
New-TransportRule -Name "CDS-Test-Hold" `
  -Priority 0 `
  -FromScope "InOrganization" `
  -SentToScope "NotInOrganization" `
  -RejectMessageReasonText "Email held for CDS PHI analysis" `
  -Comments "Test rule for CDS demo"
```

### 3. Send Test Email with PHI
```powershell
Send-MailMessage `
  -From "test@yourtenant.onmicrosoft.com" `
  -To "test@gmail.com" `
  -Subject "Test: MRN-2024-12345 Patient Records" `
  -Body "MRN: MRN-2024-98765, Aadhar: 234567891234, DOB: 15/03/1985" `
  -SmtpServer outlook.office365.com -UseSsl -Port 587 `
  -Credential (Get-Credential)
```

### 4. Check Message Trace
```powershell
# Should show in CDS portal within 5 seconds
# Email status: FAILED or PENDING (depending on transport rule action)

$EndDate = Get-Date
$StartDate = $EndDate.AddMinutes(-2)

Get-MessageTrace -StartDate $StartDate -EndDate $EndDate `
  -Status "Failed", "Pending" |
  Select-Object Received, SenderAddress, RecipientAddress, Subject, Status |
  Format-Table -AutoSize
```

---

## Success Checklist

- [ ] Server starts without errors
- [ ] Test script creates 3 incidents in CDS
- [ ] Portal shows incidents with HELD status
- [ ] AI analysis displays for each email
- [ ] Can click RELEASE button successfully
- [ ] Can click REJECT button successfully
- [ ] Status changes in portal update correctly
- [ ] Analytics tab shows blocked count increase
- [ ] (Optional) Real M365 email appears in portal within 5 sec
- [ ] (Optional) Message trace confirms email status

---

## Troubleshooting

### Server won't start
```bash
# Clear port if in use
lsof -i :5000
kill -9 <PID>
npm start
```

### Incidents not appearing in portal
```bash
# Check server logs
tail -f /tmp/cds-server.log

# Manually test webhook
curl -X POST http://localhost:5000/api/webhook/check-email-safety \
  -H "Content-Type: application/json" \
  -d '{
    "from": "test@test.com",
    "to": "external@gmail.com",
    "subject": "Test: Aadhar 234567891234",
    "body": "Contains MRN-2024-12345",
    "messageId": "test-123"
  }'
```

### Real M365 email not captured
- Check if webhook URL is reachable from M365
- Verify transport rule is enabled
- Wait 5-10 seconds for processing
- Check message trace with longer date range

---

## What to Show Tomorrow (11 AM)

**Jury will see:**

1. ✅ Email sent to external recipient (Gmail)
2. ✅ CDS portal shows it HELD within seconds
3. ✅ AI analysis explains why (PHI detected)
4. ✅ Admin clicks RELEASE
5. ✅ Portal shows "Email approved for delivery"
6. ✅ Message trace confirms email was sent
7. ✅ Audit trail shows timestamp and admin name

**Timeline: 5 minutes max**

---

## After Testing - Deploy to Railway

```bash
# Push to GitHub from local machine
git push origin main

# Railway auto-deploys from main branch
# Check deployment at: https://cds.kloudeai.xyz

# Verify live:
curl https://cds.kloudeai.xyz/api/stats
# Should return incident counts and metrics
```

---

## Demo Day Final Checklist (Oct 16, 11 AM)

- [ ] Server running locally or Railway deployment active
- [ ] Have 3 test emails ready to show
- [ ] PowerShell commands copied (TRANSPORT-RULE-SETUP.md)
- [ ] Message trace commands ready
- [ ] This QUICK-START-TEST.md printed out
- [ ] JURY-DEMO-GUIDE.md reviewed
- [ ] Backup plan if internet drops (local test script)
- [ ] Coffee ready ☕

---

## Estimated Time

```
Setup:           5 minutes (npm install)
Server Start:    2 minutes
Test Script:     3 minutes (creates incidents)
Portal Test:     10 minutes (RELEASE/REJECT workflow)
M365 Real Test:  10 minutes (optional)
─────────────────────────────
Total:          20-30 minutes
```

**You're ready to demo in 30 minutes!** 🚀

---

## Support

If anything breaks:

```bash
# Last resort - reset everything
npm install --force
rm incidents.db
npm start
node test-transport-rule.js
```

This repo is battle-tested for demo day. You got this! 💪
