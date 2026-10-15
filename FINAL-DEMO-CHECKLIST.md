# Clinical Data Sentinel - Final Demo Checklist
**October 16, 2026 | 11:00 AM IST Demo**

---

## 🚀 STEP 1: Verify Deployment & Credentials (Do NOW - 10 minutes before demo)

### A. Check Railway Deployment Status
```
1. Open: https://railway.app/dashboard
2. Select: "clinical-data-sentinel" project
3. Click: "Deployments" tab
4. Verify:
   ✓ Latest deployment status = "Deployment successful" (green)
   ✓ Timestamp = TODAY (Oct 16)
5. Click: "Variables" tab
6. Verify these are SET:
   ✓ AZURE_TENANT_ID = (has a value)
   ✓ AZURE_CLIENT_ID = (has a value)
   ✓ AZURE_CLIENT_SECRET = (has a value)
   ✓ MAILBOX_EMAIL = (your M365 mailbox email)
```

**If any variable is MISSING:**
→ Add it now in Railway Variables
→ Click "Redeploy" button
→ Wait 3-5 minutes for deployment
→ Don't proceed until deployment shows green checkmark

### B. Test System Health (From Terminal or Browser)

**Option 1: Browser (Easy)**
```
Open: https://cds.kloudeai.xyz/api/diagnostic/system-health
Check for:
  ✓ "status": "READY" (not "MISSING_CREDENTIALS")
  ✓ "m365": { "initialized": true, "token_available": true }
  ✓ "database": { "total": ... }
```

**Option 2: Terminal (If browser doesn't work)**
```bash
curl -s https://cds.kloudeai.xyz/api/diagnostic/system-health | jq .

Expected output:
{
  "status": "READY",
  "m365": {
    "initialized": true,
    "token_available": true
  },
  ...
}
```

**If "MISSING_CREDENTIALS":**
→ Azure variables not set in Railway
→ Go back to Step 1A
→ Check variables are saved and deployed

---

## 🎯 STEP 2: Dashboard Ready Check (5 minutes before demo)

### A. Open Dashboard
```
1. Open browser: https://cds.kloudeai.xyz
2. Check for:
   ✓ Dashboard loads (no 404 or error page)
   ✓ Incident list visible (may be empty)
   ✓ Stats show: 0 incidents, 0 safe, 0 anomalous, etc.
3. Note current incident count (for comparison)
```

### B. Check Database State
```
Open: https://cds.kloudeai.xyz/api/incidents
Expected:
  ✓ Returns JSON array (may be empty [])
  ✓ No errors
```

**If you see previous incidents from last run:**
→ Optional: Clear database with: `DELETE FROM incidents`
→ But demo works fine with old incidents too

---

## 📧 STEP 3: Send Test Email (2 minutes before demo starts)

### Send Email #2 (ANOMALOUS Medical Data)

**DO THIS 2 MINUTES BEFORE JURY ARRIVES**

```
From: PradeepG@kloudeai.xyz
To: divineenergy88@gmail.com (jury member email)
Subject: URGENT: Patient Case Review - MRN-2024-87654

Body: [Use FULL medical content from TEST-EMAIL-TEMPLATES.md - Email #2]

→ Click SEND
→ Email will be BLOCKED by transport rule (if enabled)
  OR detected by sync (if transport rule disabled)
```

**What happens next:**
- ⏱️ Wait 5-10 seconds
- 📊 Refresh CDS dashboard
- 🔴 New incident appears with ANOMALOUS badge (red)
- Confidence: 90-95%
- PHI: Multiple types detected

---

## ✅ STEP 4: LIVE DEMO (11:00 AM IST)

### Phase 1: Show Empty Dashboard (30 seconds)
```
1. Click "Refresh" or F5 on dashboard
2. Show incident count before demo
3. Say: "This dashboard shows zero-to-low incidents at start"
```

### Phase 2: Watch Email Detection (1 minute)
```
1. Say: "I'll now send an email containing medical information"
2. [Refer to already-sent email from Step 3]
3. Refresh dashboard every 3 seconds
4. After 5-10 seconds: New incident appears
5. Point out:
   ✓ Sender: PradeepG@kloudeai.xyz
   ✓ Recipient: jury-member@gmail.com
   ✓ Risk: 🔴 ANOMALOUS (red badge)
   ✓ Confidence: 95%
   ✓ PHI Detected: Shows multiple types
```

### Phase 3: Click RELEASE Button (1 minute)
```
1. Click on the incident to open details
2. Show:
   ✓ Full AI Analysis of PHI detected
   ✓ DPDP Article 8 violation noted
   ✓ NABH Standard 3.1 referenced
3. Click GREEN button: "RELEASE APPROVED"
4. Wait for response:
   ✓ Shows "✅ APPROVED FOR DELIVERY"
   ✓ Status: "Email sent via Graph API"
   ✓ Timestamp: Shows current time
5. Say: "This button just sent the email to the jury member's inbox via Microsoft Graph API"
```

### Phase 4: Verify in Message Trace (2 minutes)
```
1. Open: https://admin.microsoft.com
2. Go to: Mail Flow > Message Trace
3. Search by:
   - From: PradeepG@kloudeai.xyz
   - To: jury-member@gmail.com
   - Subject contains: "Patient" or "MRN"
4. Show TWO entries:

   ENTRY 1 (FAILED - Original):
   - Status: FAILED
   - Error: TransportRuleReject (if rule enabled)
   OR: No entry (if rule disabled)
   - Timestamp: ~11:XX:XX IST (first send time)

   ENTRY 2 (DELIVERED - Released):
   - Status: DELIVERED
   - Time: ~11:XX:XX IST (release button time)
   - Message ID: Shows it went through

5. Say: "Here you can see the original email was blocked 
         (red X), but after I clicked the SAFE button,
         it was approved and delivered (green check)"
```

### Phase 5: Confirm Delivery to Jury Member (1 minute)
```
1. Ask jury member: "Can you check your inbox?"
2. They should see the email with subject: "URGENT: Patient Case Review..."
3. Confirm delivery time matches Message Trace timestamp
```

### Phase 6: Show Audit Trail (30 seconds)
```
1. Click: /api/incidents/:id/actions (via browser or API)
2. Or on dashboard, show Incident Details
3. Point out:
   ✓ Action: "released"
   ✓ Reason: "Admin approved - Email sent via Graph API"
   ✓ Timestamp: Exact moment SAFE was clicked
   ✓ Taken by: Portal Admin
```

---

## 🎓 What This Demonstrates to Jury

✅ **Real-time Detection:**
   - Email with PHI detected automatically within seconds
   - No manual intervention needed for detection

✅ **Accurate Classification:**
   - System correctly identified DPDP Article 8 violation
   - External recipient + medical data = ANOMALOUS

✅ **Admin Control:**
   - Email is held (not delivered automatically)
   - Admin reviews incident on dashboard
   - Admin can decide: RELEASE or BLOCK

✅ **Compliance Proof:**
   - Message Trace shows FAILED (blocked) then DELIVERED (approved)
   - Complete audit trail with timestamps
   - Regulatory proof of control and review

✅ **Enterprise-Grade:**
   - Uses Microsoft Graph API for official delivery
   - Integrates with M365 Message Trace
   - Scales to organization-wide monitoring

---

## ⚠️ TROUBLESHOOTING (If Things Go Wrong)

### Issue: "RELEASE button doesn't send email"

**Check #1: Azure Credentials**
```
curl https://cds.kloudeai.xyz/api/diagnostic/system-health | jq '.m365'
If token_available = false → credentials missing
→ Go back to Step 1A, add variables, redeploy
```

**Check #2: Logs**
```
Railway Dashboard → Select Service → Logs tab
Look for: [RELEASE] or [GRAPH SEND]
Should show: "Token obtained successfully"
```

**Check #3: Manual Sync**
```
curl -X POST https://cds.kloudeai.xyz/api/sync-emails
Manually trigger email sync
Wait 5 seconds, refresh dashboard
```

### Issue: "Incident not appearing on dashboard"

**Check #1: Transport Rule**
```
If transport rule is DISABLED:
→ Incidents detected via M365 sync (every 5 minutes)
→ Click /api/sync-emails to trigger immediately

If transport rule is ENABLED:
→ Incidents should appear in real-time via webhook
→ Check webhook is receiving calls from M365
```

**Check #2: PHI Detection**
```
Email body must have clear medical data keywords:
✗ DON'T USE: "we need to discuss the patient"
✓ USE: "Patient ID: 12345" or "Diagnosis: Diabetes"

Check: detectPHI patterns in cds-server.js
```

**Check #3: Risk Stratification**
```
If email appears as SAFE but should be ANOMALOUS:
→ Check: recipient must be EXTERNAL (not @hospital.com)
→ Check: PHI must be detected
→ Both conditions = ANOMALOUS
```

### Issue: "Email not in jury member's inbox"

**Likely Cause:** M365 sync delay (up to 2 minutes)

**Fix:**
```
1. Wait 2 minutes
2. Refresh their Outlook (Ctrl+F5)
3. Check Junk/Spam folder
4. Check correct recipient email used
```

---

## 📞 CRITICAL SUCCESS FACTORS

DO THIS (Will work):
✓ Azure credentials SET in Railway Variables
✓ Deployment shows GREEN checkmark
✓ /api/diagnostic/system-health returns "READY"
✓ Test email has clear medical data (use template)
✓ RELEASE button waits for response (5-10 seconds)
✓ Message Trace search is exact (from/to/subject)

DON'T DO THIS (Will fail):
✗ Skip credential setup
✗ Send vague email ("please review")
✗ Click RELEASE and immediately refresh
✗ Use wrong jury member email
✗ Disable transport rule without documentation
✗ Try demo without sync time (wait 5-10 sec after send)

---

## 🟢 GREEN LIGHT - READY FOR DEMO

Before jury arrives, verify:
- [ ] Railway deployment status = SUCCESS (green)
- [ ] Azure credentials visible in Railway Variables
- [ ] /api/diagnostic/system-health returns "READY"
- [ ] https://cds.kloudeai.xyz loads (dashboard accessible)
- [ ] Test email with Medical Data ready to send
- [ ] Jury member email correct (divineenergy88@gmail.com or actual address)
- [ ] Message Trace accessible (https://admin.microsoft.com)
- [ ] This document has been read and understood

✅ **ALL CHECKS PASSED? → DEMO IS READY**

---

## 📊 Demo Timeline

- **10:50 AM:** Run Step 1 (Verify Deployment)
- **10:55 AM:** Run Step 2 (Dashboard Ready)
- **10:58 AM:** Run Step 3 (Send Test Email)
- **11:00 AM:** Demo starts
  - 11:00-11:02: Show dashboard, explain problem
  - 11:02-11:07: Send email (or recap pre-sent), watch detection
  - 11:07-11:08: Click RELEASE button
  - 11:08-11:10: Show Message Trace verification
  - 11:10-11:11: Confirm inbox delivery
  - 11:11-11:15: Q&A, roadmap discussion
  - **Total: ~15 minutes (within time limit)**

---

**Document Status:** READY FOR OCTOBER 16 DEMO  
**Last Updated:** October 16, 2026, 01:30 AM IST  
**Created by:** Clinical Data Sentinel Team
