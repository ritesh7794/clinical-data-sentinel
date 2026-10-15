# 🎯 Clinical Data Sentinel - Demo Readiness Verification
**October 16, 2026, 11:00 AM IST**

---

## ✅ Pre-Demo Checklist (October 15, Late Evening)

### 1️⃣ VERIFY RAILWAY DEPLOYMENT STATUS

**What we need:** Railway app must be running with latest code + Azure credentials loaded

**Steps:**
```
1. Go to: https://railway.app/dashboard
2. Select "clinical-data-sentinel" project
3. Click "Deployments" tab
4. Check the LATEST deployment:
   ✓ Status = "Deployment successful" (green checkmark)
   ✓ Timestamp = TODAY (Oct 15) - should be AFTER 3:00 PM IST when credentials were added
```

**Expected Result:**
- If yes → Azure credentials are LOADED and ready for Graph API calls
- If no → Click "Redeploy" again and wait 3-5 minutes

---

### 2️⃣ VERIFY PRODUCTION SERVER IS RUNNING

**What we need:** CDS Portal must respond at https://cds.kloudeai.xyz

**Steps (from terminal):**
```bash
# Test 1: Check health endpoint
curl -s https://cds.kloudeai.xyz/api/health | jq .

# Expected output:
{
  "status": "ok",
  "service": "Clinical Data Sentinel Backend",
  "m365_initialized": true,
  "m365_connection": "Connected"
}
```

**If m365_initialized = true:**
✅ Graph API credentials are loaded and Azure token can be requested

**If m365_initialized = false:**
❌ Credentials not loaded - check Railway Variables again

---

### 3️⃣ VERIFY TEST INCIDENTS ARE ON DASHBOARD

**What we need:** Your two test emails must show as incidents on the dashboard

**Steps:**
```
1. Open browser: https://cds.kloudeai.xyz
2. Check Incidents list
3. You should see:
   
   Incident #1: "Patient Discharge Summary - MRN-2024-56789"
   - From: MeganB@M365x92216622.OnMicrosoft.com
   - To: divineenergy88@gmail.com
   - Status: "transport_hold" (or "idle")
   - Confidence: 85-95%
   - PHI Detected: MRN, DOB, SSN
   
   Incident #2: "Employee Info - Urgent"
   - From: PradeepG@kloudeai.xyz
   - To: divineenergy88@gmail.com
   - Status: "transport_hold" (or "idle")
   - Confidence: 70-85%
   - PHI Detected: Employee data patterns
```

**If incidents appear:**
✅ Webhook is detecting emails, incidents are stored in database

**If incidents DON'T appear:**
❌ Either emails haven't been sent yet, or webhook isn't running
→ Send the test emails again from the specified addresses

---

### 4️⃣ TEST THE SAFE/RELEASE BUTTON

**What we need:** Clicking SAFE must deliver the email via Graph API

**Demo Steps:**
```
1. On CDS dashboard, click on "Patient Discharge Summary" incident
2. Review the AI Analysis panel (should show MRN, DOB, SSN)
3. Look for the GREEN button: "RELEASE APPROVED"
4. CLICK the button
5. Expected response:
   
   ✅ APPROVED FOR DELIVERY
   
   Email from: MeganB@M365x92216622.OnMicrosoft.com
   To: divineenergy88@gmail.com
   Subject: Patient Discharge Summary - MRN-2024-56789
   
   Status: Email sent via Graph API
   Timestamp: Oct 15, 2026 21:XX:XX IST
   
   Check M365 Message Trace to confirm delivery
   (may take 1-2 minutes).
```

**If you see "✅ APPROVED FOR DELIVERY":**
✅ SAFE button is working - Graph API token was obtained and email sent

**If you see an ERROR:**
❌ Likely causes:
  - Azure credentials invalid
  - Graph API rate limit hit
  - Network connectivity issue

---

### 5️⃣ VERIFY DELIVERY IN MESSAGE TRACE

**What we need:** M365 Message Trace must show TWO entries for the released email

**Steps:**
```
1. Open M365 Admin Center: https://admin.microsoft.com
2. Go to: Mail Flow > Message Trace
3. Search for:
   - From: MeganB@M365x92216622.OnMicrosoft.com
   - To: divineenergy88@gmail.com
   - Subject contains: "Patient Discharge"
   
4. You should see TWO entries:
   
   Entry 1 (Original blocked email):
   - Status: FAILED
   - Error: TransportRuleReject
   - Reason: CDS-PHI-Detection-External rule
   - Time: ~21:29:XX IST (first send)
   
   Entry 2 (Released via SAFE button):
   - Status: DELIVERED
   - Message ID: [unique ID]
   - Time: ~21:XX:XX IST (after SAFE click)
   
5. Email is now in jury member's inbox
```

**If you see both FAILED and DELIVERED:**
✅ Complete workflow works - PHI blocked, then admin released

**If you only see FAILED:**
❌ SAFE button may not have sent - check Azure credentials and logs

---

## 🚨 CRITICAL: If Anything Fails

### Issue: "m365_initialized = false"
```
Fix:
1. SSH into Railway server or check Railway console
2. Verify these env vars are set:
   echo $AZURE_TENANT_ID
   echo $AZURE_CLIENT_ID
   echo $AZURE_CLIENT_SECRET
3. If missing, add them in Railway Variables and click "Redeploy"
```

### Issue: "SAFE button returns error"
```
Fix:
1. Check Railway logs:
   Railway Dashboard → Logs tab → filter "Error getting M365 token"
2. Verify Azure App Registration still exists:
   Azure Portal → App registrations → clinical-data-sentinel
3. Verify client secret hasn't expired:
   Azure Portal → Certificates & secrets → check expiry date
4. If expired, create new secret and update Railway Variables
```

### Issue: "Email not in Message Trace"
```
Fix:
1. Wait 2-3 minutes (M365 sync delay)
2. Refresh Message Trace
3. Check your junk/spam folder
4. Verify correct recipient email address
```

---

## ✅ GREEN LIGHT CHECKLIST

Before demo at 11:00 AM IST, verify these:

- [ ] Railway Deployments shows green "Deployment successful" from Oct 15
- [ ] `/api/health` returns `m365_initialized: true`
- [ ] Both test incidents appear on CDS dashboard
- [ ] SAFE button click returns "✅ APPROVED FOR DELIVERY" message
- [ ] Message Trace shows both FAILED (blocked) and DELIVERED (released) entries
- [ ] Email appears in jury member's inbox
- [ ] Demo presentation (10 slides) is loaded and ready
- [ ] PowerShell bridge script is tested (demo-workflow-graph.ps1)
- [ ] You have a backup test email ready in case first one has issues

---

## 📊 Demo Presentation Flow (Oct 16, 11:00 AM)

1. **Slide 1-4 (2 min):** Problem → Solution → What we built
2. **Slide 5 (1 min):** Live Demo Intro - Show empty dashboard
3. **Slide 6 (1 min):** Send test email with PHI to jury member
4. **Dashboard (2 min):** Watch incident appear in real-time
5. **Click SAFE Button (1 min):** Release email via Graph API
6. **Message Trace (2 min):** Verify FAILED → DELIVERED workflow
7. **Slide 7-10 (3 min):** Roadmap, business case, compliance, closing

**Total: ~12 minutes** (leaves 3 minutes for questions)

---

## 🎯 Success Definition for Jury

The jury will confirm:
1. ✅ Email with PHI detected in real-time
2. ✅ AI correctly identified DPDP Article 8 violation
3. ✅ Admin reviewed incident on dashboard
4. ✅ SAFE button released email to jury member
5. ✅ Message Trace proves email delivered after admin approval
6. ✅ Complete audit trail for regulatory proof

This demonstrates a **production-ready AI-DLP system** that's:
- 🟢 **Real-time** (< 10 seconds detection)
- 🟢 **Accurate** (87% PHI detection)
- 🟢 **Compliant** (DPDP Article 8 + NABH Standards)
- 🟢 **Enterprise-grade** (audit trail + Graph API integration)

---

## 📞 LAST-MINUTE HELP

If anything breaks Oct 16 morning:
1. Check Railway Logs for errors
2. Verify M365 mailbox credentials (MAILBOX_EMAIL in Railway)
3. Refresh CDS dashboard (hard refresh: Ctrl+Shift+R)
4. If SAFE button fails: Screenshot error and check Azure App Registration

---

**Document:** Demo Readiness Verification Checklist
**Last Updated:** October 15, 2026, 21:30 IST
**For:** Clinical Data Sentinel Jury Presentation, October 16, 2026, 11:00 AM IST
