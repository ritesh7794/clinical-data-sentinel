# Clinical Data Sentinel - Jury Demo Guide (Oct 16, 11 AM)

## Demo Objective
Show **Prevention by Design** - emails containing PHI are HELD at M365 level until admin approves them in CDS portal.

**Key Message:** "No unauthorized PHI disclosure is possible. Every email is analyzed, held if needed, and can only leave after explicit admin approval."

---

## 30-Minute Demo Flow

### **Part 1: Problem Statement (2 minutes)**

```
"Healthcare organizations leak PHI daily. A doctor sends patient records to Gmail 
instead of the hospital system. By the time you detect it... it's already gone.

With Clinical Data Sentinel:
- Email is INTERCEPTED before it leaves
- AI analyzes for PHI patterns
- Admin REVIEWS and APPROVES in seconds
- Complete audit trail for compliance
- Breach becomes IMPOSSIBLE"
```

---

### **Part 2: Live Demo - Test Email Workflow (15 minutes)**

#### **2.1 Send Test Email with PHI**

Open PowerShell and send a test email:

```powershell
# Email with PHI to external recipient
Send-MailMessage -From "doctor@hospital.local" `
  -To "patient@gmail.com" `
  -Subject "Patient Follow-up: MRN-2024-98765" `
  -Body @"
Dear Sarah,

Here are your medical records:
- Medical Record Number: MRN-2024-98765
- Date of Birth: 15/03/1985
- Aadhar ID: 234567891234
- Phone: +91-9876543210
- Policy Number: POL-2024-456789

Please review and confirm.

Dr. John Smith
Internal Medicine Department
"@ -SmtpServer smtp.office365.com -UseSsl -Port 587 -Credential $cred

Write-Host "✅ Email sent to external recipient (Gmail)"
```

**What happens:**
- ✅ Email sent
- ✅ M365 Transport Rule intercepts it
- ✅ Calls CDS webhook in real-time
- ✅ CDS analyzes and detects: Aadhar, MRN, DOB, Phone, Policy #

---

#### **2.2 Show CDS Portal - Email Detected**

Switch to browser and open CDS Dashboard:
```
https://cds.kloudeai.xyz/dashboard
```

**Narrate:**
> "Within seconds, the email appears in CDS portal. Notice:
> - **Status:** HELD FOR REVIEW (not delivered to external Gmail)
> - **PHI Detected:** Aadhar, MRN, DOB, Phone, Policy #
> - **Confidence:** 95% certainty of PHI presence
> - **Risk Level:** ANOMALOUS (external recipient + PHI)
> - **Compliance:** Violates DPDP Article 8 (technical measures required)"

---

#### **2.3 AI Analysis in CDS Portal**

Click on the incident in CDS portal. The AI assistant shows:

```
🚨 CRITICAL. Anomalous communication detected.
PHI types: Aadhar, MRN, DOB, Phone, Policy #
Confidence: 95%
Violates DPDP Article 8 and NABH Standard 2.3
IMMEDIATE ACTION recommended: Review by compliance officer. 
Consider blocking until cleared.
```

**Ask the AI:** "Why was this flagged?"

```
Flagged as anomalous because: PHI (Aadhar, MRN, DOB) detected going to 
external recipient (patient@gmail.com). Violates DPDP Article 8 which 
requires explicit authorization for external transfers. Confidence: 95% 
indicates high certainty of PHI presence.
```

---

#### **2.4 Admin Approves or Blocks**

Show the two action buttons in CDS portal:

**Option A: BLOCK the Email** 🚫

```
Click "REJECT (Don't Send)" button
↓
Email status changes to REJECTED
↓
Message trace confirms: Email NOT DELIVERED
```

**Option B: RELEASE the Email** ✅

```
Click "RELEASE TO SEND" button
↓
Email status changes to RELEASED
↓
Message trace confirms: Email DELIVERED to external recipient
```

**Narrate:**
> "This is the admin's decision point. For high-confidence PHI violations, 
> they choose to BLOCK. For emails later reviewed as safe, they choose RELEASE.
> Either way, the decision is logged with timestamp and reason."

---

### **Part 3: Message Trace Verification (8 minutes)**

Show email was actually blocked/released by running PowerShell:

```powershell
# Check message trace for both scenarios

# Scenario 1: REJECTED email
Get-MessageTrace -Status "Failed" -StartDate (Get-Date).AddMinutes(-5) |
  Where-Object {$_.Subject -like "*MRN*"} |
  Select-Object Received, SenderAddress, RecipientAddress, Subject, Status |
  Format-Table -AutoSize

# Output shows: Status = "Failed" (email was BLOCKED)

Write-Host "`n---`n"

# Scenario 2: RELEASED email (if sent again)
Get-MessageTrace -Status "Delivered" -StartDate (Get-Date).AddMinutes(-5) |
  Where-Object {$_.Subject -like "*MRN*"} |
  Select-Object Received, SenderAddress, RecipientAddress, Subject, Status |
  Format-Table -AutoSize

# Output shows: Status = "Delivered" (email was SENT)
```

**Narrate:**
> "Here's the message trace from M365 Exchange. Notice:
> 
> **Email 1 (REJECTED in CDS):**
> - Status: FAILED
> - Reason: Blocked by transport rule due to PHI detection
> - Email never reached Gmail inbox
> 
> **Email 2 (RELEASED in CDS):**
> - Status: DELIVERED
> - Email successfully sent to external recipient
> - But with complete audit trail showing admin approved it"

---

### **Part 4: Audit Trail & Compliance (3 minutes)**

Show the compliance dashboard:

**Go to Analytics Tab in CDS:**

```
📊 Analytics & Insights

- Blocked Incidents: 3
- Verified Safe: 2
- External Recipients: 73%
- Detection Accuracy: 87%

Risk Distribution:
- ANOMALOUS (PHI + External): 3
- REVIEW (Moderate risk): 2
- SAFE (Internal only): 5

Top Senders: doctor.john@hospital.local (3 emails)
Top Recipients: patient@gmail.com, partner@gmail.com

PHI Types Detected:
- Aadhar: 35%
- MRN: 30%
- SSN: 20%
- DOB: 15%
```

**Action Timeline for Selected Incident:**
```
10:15 AM - Email intercepted by transport rule
10:15 AM - CDS analysis completed (95% confidence)
10:16 AM - Incident created in CDS portal (status: transport_hold)
10:18 AM - Admin reviewed in portal
10:18 AM - Admin action: REJECTED (email blocked)
10:18 AM - Status: rejected, logged with timestamp
```

**Narrate:**
> "Every decision is logged automatically. For regulators, we have:
> - Exact timestamp of detection
> - Confidence score of AI analysis
> - Exact timestamp of admin decision
> - Reason for decision
> - Evidence that email was/wasn't delivered
> 
> This is **Compliance by Design** - DPDP Article 8 requires 'technical 
> and organizational measures.' We provide both."

---

## Key Talking Points for Jury

### **Problem We Solved:**
✅ Healthcare orgs leak PHI daily  
✅ By the time breach is detected, damage is done  
✅ Regulators penalize with 5% of annual revenue fines  
✅ No existing solution prevents email from leaving  

### **Our Solution:**
✅ **Intercept** - Transport rule catches email before sending  
✅ **Analyze** - AI detects 8 PHI patterns with 87% accuracy  
✅ **Decide** - Admin reviews and approves/blocks in CDS portal  
✅ **Prove** - Complete audit trail for compliance audits  

### **Why It Matters:**
✅ **Prevention > Detection** - Breach never happens  
✅ **Real-Time** - Analysis in milliseconds  
✅ **Easy to Use** - One-click approve/block  
✅ **Compliant** - Meets DPDP Article 8, NABH Standard 2.3  

### **Competitive Advantage:**
✅ Most DLP solutions block emails completely  
✅ We allow admin to override with approval trail  
✅ No other Indian healthcare solution shows this  
✅ Ready for AICIL, Fortis, NABH-certified hospitals  

---

## Demo Troubleshooting

### **Email Not Showing in CDS Portal?**
```powershell
# Check if webhook was called
# (Look at CDS server logs)

# Manual test webhook
$Body = @{
  from = "doctor@hospital.local"
  to = "patient@gmail.com"
  subject = "Test: MRN-2024-12345"
  body = "Contains Aadhar: 234567891234"
  messageId = "test-$(Get-Date -f yyyyMMddHHmmss)"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://cds.kloudeai.xyz/api/webhook/check-email-safety" `
  -Method Post -ContentType "application/json" -Body $Body
```

### **Message Trace Not Showing Status?**
```powershell
# Wait 2-3 minutes for trace to appear
# Try with longer date range
Get-MessageTrace -StartDate (Get-Date).AddHours(-1) -EndDate (Get-Date) |
  Where-Object {$_.Subject -like "*test*"}
```

### **Portal Not Loading?**
- Refresh browser (Ctrl+Shift+R)
- Check if Railway deployment is running
- Verify internet connectivity

---

## Post-Demo Follow-Up

**For AICIL/Fortis/NABH Hospitals:**

Provide them with:
1. ✅ This JURY-DEMO-GUIDE.md (how to replicate)
2. ✅ TRANSPORT-RULE-SETUP.md (PowerShell commands)
3. ✅ test-transport-rule.js (automated testing)
4. ✅ CDS portal access (cds.kloudeai.xyz)
5. ✅ 30-day implementation plan

**Expected Timeline:**
- Week 1: M365 integration & transport rule setup
- Week 2: Testing with sample emails
- Week 3: Staff training
- Week 4: Go-live & monitoring

---

## Success Metrics for Demo

✅ Email with PHI sent → Portal shows it within 5 seconds  
✅ AI analysis appears with confidence score  
✅ Admin can click RELEASE/REJECT  
✅ Message trace confirms email was blocked/released  
✅ Audit trail shows exact timestamp of decision  
✅ Jury understands: "Prevention, not just detection"  

---

## Presentation Slides Reference

- **Slide 2:** The Daily Risk (why this matters)
- **Slide 3:** The Solution (3 steps: intercept, analyze, decide)
- **Slide 5:** Live Demo (incidents dashboard)
- **Slide 6:** Analytics (compliance visibility)
- **Slide 7:** Prevention by Design (this is what we're showing)
- **Slide 8:** Business Case (DPDP compliance)

**During demo, reference Slide 7:**
> "This is what we're demonstrating right now. 
> Email never leaves the organization without explicit admin approval. 
> That's the definition of 'Prevention by Design.'"

---

## Time Allocation

- **0:00 - 2:00** Problem + Solution overview
- **2:00 - 12:00** Live demo (send email, show portal, approve/reject)
- **12:00 - 17:00** Message trace verification
- **17:00 - 20:00** Analytics & audit trail
- **20:00 - 30:00** Q&A + Business case

**Total: 30 minutes**

---

## One-Liner Summary

*"Clinical Data Sentinel makes it impossible for sensitive patient data to leave your organization without explicit admin approval. Every decision is logged, every email is analyzed, and every breach is prevented before it happens."*

**Good luck tomorrow! 🚀**
