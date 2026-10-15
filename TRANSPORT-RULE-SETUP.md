# Clinical Data Sentinel - Exchange Transport Rule Setup

## Overview
This guide explains how to configure Microsoft 365 Exchange Transport Rules to integrate with Clinical Data Sentinel for real-time PHI detection and email quarantine/approval workflow.

**What happens:**
1. Email to external recipient → Transport rule intercepts
2. Transport rule calls CDS webhook to check if email contains PHI
3. CDS analyzes and returns `allow: true/false`
4. If PHI detected: Email is rejected/held
5. Admin reviews in CDS portal and approves or blocks
6. Message traces show the decision

---

## Prerequisites

✅ M365 tenant with Exchange Online  
✅ PowerShell with Exchange Online Management module  
✅ Global Admin or Exchange Admin role  
✅ CDS server running and accessible (e.g., https://cds.kloudeai.xyz)  

---

## Step 1: Connect to Exchange Online PowerShell

```powershell
# Install the module (if not already installed)
Install-Module -Name ExchangeOnlineManagement -Force

# Connect to Exchange Online
Connect-ExchangeOnline -UserPrincipalName your-admin@yourtenant.onmicrosoft.com
```

---

## Step 2: Create the Transport Rule

This rule will intercept all outbound emails to external recipients and call the CDS webhook.

```powershell
# Set your CDS webhook URL
$WebhookURL = "https://cds.kloudeai.xyz/api/webhook/check-email-safety"

# Create Transport Rule for External Recipients
New-TransportRule -Name "CDS-PHI-Detection-External" `
  -Priority 0 `
  -FromScope "InOrganization" `
  -SentToScope "NotInOrganization" `
  -RejectMessageReasonText "Email contains sensitive PHI and requires CDS approval. Contact your Security Administrator." `
  -SetScalarHeaderValue @{`
    "X-CDS-Webhook-URL" = $WebhookURL;
    "X-CDS-Check-Required" = "true"
  } `
  -Comments "Clinical Data Sentinel - Detect and hold emails with PHI to external recipients"
```

---

## Step 3: Alternative - Using DLP for Automatic Blocking

If you want automatic blocking based on CDS analysis, create a more aggressive rule:

```powershell
# Create rule that blocks high-risk communications
New-TransportRule -Name "CDS-Block-ANOMALOUS-PHI" `
  -Priority 1 `
  -FromScope "InOrganization" `
  -SentToScope "NotInOrganization" `
  -SubjectContains @("Aadhar", "SSN", "MRN", "Policy Number", "Medical Record") `
  -RejectMessageReasonText "Email contains Protected Health Information (PHI). Cannot send to external recipients. CDS has flagged this as HIGH RISK. Please contact your Compliance Officer." `
  -Comments "Automatic blocking for emails with explicit PHI indicators"
```

---

## Step 4: Monitor Held Emails in Exchange Queue

```powershell
# Check emails currently held in the queue
Get-TransportService | Get-Message -ResultSize Unlimited | 
  Where-Object {$_.Recipients -like "*@gmail.com" -or $_.Recipients -like "*@outlook.com"} |
  Select-Object -Property Identity, FromAddress, Recipients, Subject, DateReceived, Status

# For more details on a specific message
Get-Message -Identity "MessageIDHere" | fl
```

---

## Step 5: Verify Transport Rule is Active

```powershell
# List all transport rules
Get-TransportRule | Select-Object Name, Priority, State, Description

# Get specific rule details
Get-TransportRule -Identity "CDS-PHI-Detection-External" | fl
```

---

## Testing Workflow

### Test Case 1: Email with PHI to External Address

```powershell
# Send a test email containing PHI patterns
$EmailParams = @{
  From       = "doctor@yourtenant.onmicrosoft.com"
  To         = "patient@gmail.com"
  Subject    = "Test - MRN-2024-12345 Patient Records"
  Body       = @"
Patient Information:
- MRN: MRN-2024-98765
- DOB: 15/03/1985
- Aadhar: 234567891234
- Phone: +91-9876543210
"@
}

Send-MailMessage @EmailParams -SmtpServer outlook.office365.com -UseSsl -Port 587 -Credential $AdminCred

# This email should be HELD by CDS transport rule
# It will appear in CDS portal for admin approval
```

### Test Case 2: Safe Email to External Address

```powershell
# Send a test email with NO PHI
$SafeEmailParams = @{
  From       = "admin@yourtenant.onmicrosoft.com"
  To         = "partner@gmail.com"
  Subject    = "Meeting Schedule Update"
  Body       = "Please join us for the meeting at 2 PM in Conference Room B. See agenda attached."
}

# This email should be ALLOWED and delivered immediately
```

---

## Message Trace - Verify Blocking and Releasing

### Real-time Message Trace (Last 10 minutes)

```powershell
# Check message delivery status in last 10 minutes
$EndDate = Get-Date
$StartDate = $EndDate.AddMinutes(-10)

Get-MessageTrace -StartDate $StartDate -EndDate $EndDate `
  -SenderAddress "doctor@yourtenant.onmicrosoft.com" `
  -Status "Delivered", "Failed", "Pending" |
  Select-Object Received, SenderAddress, RecipientAddress, Subject, Status, ToIP |
  Format-Table -AutoSize

# Get detailed trace for a specific email
Get-MessageTraceDetail -MessageTraceId "MessageIDHere" | Select-Object Timestamp, Event, Action, Detail
```

### Find Rejected/Blocked Emails

```powershell
# Find emails rejected by transport rules in last 24 hours
$EndDate = Get-Date
$StartDate = $EndDate.AddDays(-1)

Get-MessageTrace -StartDate $StartDate -EndDate $EndDate `
  -Status "Failed" |
  Where-Object {$_.Subject -like "*MRN*" -or $_.Subject -like "*Aadhar*"} |
  Select-Object Received, SenderAddress, RecipientAddress, Subject, Status |
  Format-Table -AutoSize
```

### Detailed Failure Reason

```powershell
# Get detailed information about why an email was rejected
$FailedTrace = Get-MessageTrace -Status "Failed" -ResultSize 1 | Select-Object -First 1

Get-MessageTraceDetail -MessageTraceId $FailedTrace.MessageTraceId -RecipientAddress $FailedTrace.RecipientAddress |
  Select-Object Timestamp, Event, Action, Detail, Status |
  Format-List
```

---

## CDS Portal Workflow for Admin

**Once email is held by transport rule:**

1. **Open CDS Portal:** https://cds.kloudeai.xyz/dashboard
2. **Go to Incidents Tab:** See all held emails
3. **Click on Email:** View AI analysis and compliance mapping
4. **Review Details:**
   - PHI Types Detected
   - Confidence Score
   - Risk Level (ANOMALOUS/REVIEW/SAFE)
   - Compliance Articles (DPDP/NABH)
5. **Make Decision:**
   - ✅ **RELEASE** - Email approved for external delivery
   - 🚫 **REJECT** - Email blocked, NOT sent to external
6. **Audit Trail:** All decisions logged with timestamp

---

## Automation - Optional Graph API Integration

When admin clicks RELEASE in CDS portal, the system can automatically:

```powershell
# This would be called by CDS backend via Graph API
# Releases email from quarantine queue

# Example: Release held message (requires additional setup)
Get-Message -ResultSize Unlimited | Where-Object {$_.Subject -like "*Test*"} | 
  Resume-Message
```

---

## Troubleshooting

### Transport Rule Not Triggering

```powershell
# Check if rule is enabled
Get-TransportRule -Identity "CDS-PHI-Detection-External" | Select-Object State

# Enable if disabled
Set-TransportRule -Identity "CDS-PHI-Detection-External" -State Enabled
```

### Check CDS Webhook Connectivity

```powershell
# Test webhook from Exchange Online
$TestEmail = @{
  from = "test@yourtenant.onmicrosoft.com"
  to = "external@gmail.com"
  subject = "Test PHI: MRN-2024-12345"
  body = "Test content with Aadhar: 234567891234"
  messageId = "test-$(Get-Date -f yyyyMMddHHmmss)"
}

# Manually call webhook (from server with PowerShell)
$JSON = $TestEmail | ConvertTo-Json
Invoke-WebRequest -Uri "https://cds.kloudeai.xyz/api/webhook/check-email-safety" `
  -Method Post `
  -ContentType "application/json" `
  -Body $JSON
```

### View CDS Backend Logs

```powershell
# SSH into CDS server and check logs
# (Replace with your actual server access method)

# Docker logs (if running in container)
# docker logs cds-server

# Or check application logs
# tail -f /var/log/cds-server.log
```

---

## Complete Demo Script

Run this script to demonstrate the full workflow:

```powershell
# 1. Send email with PHI to external
Write-Host "Sending test email with PHI..."
Send-MailMessage -From "doctor@yourtenant.onmicrosoft.com" `
  -To "test@gmail.com" `
  -Subject "Patient Data: MRN-2024-12345" `
  -Body "MRN: MRN-2024-98765, DOB: 15/03/1985, Aadhar: 234567891234" `
  -SmtpServer outlook.office365.com `
  -UseSsl -Port 587 `
  -Credential (Get-Credential)

Write-Host "Email sent. Waiting 5 seconds for CDS to process..."
Start-Sleep -Seconds 5

# 2. Check message trace
Write-Host "`nChecking message trace..."
$EndDate = Get-Date
$StartDate = $EndDate.AddMinutes(-2)

Get-MessageTrace -StartDate $StartDate -EndDate $EndDate `
  -SenderAddress "doctor@yourtenant.onmicrosoft.com" |
  Select-Object Received, RecipientAddress, Subject, Status |
  Format-Table -AutoSize

# 3. Check CDS Portal
Write-Host "`nOpen CDS Portal to approve/reject:"
Write-Host "URL: https://cds.kloudeai.xyz/dashboard"
Write-Host "`n1. Click on the incident showing the email with PHI"
Write-Host "2. Review AI analysis"
Write-Host "3. Click 'Release to Send' or 'Reject (Don't Send)'"
```

---

## Summary

✅ **Email to external → Transport rule intercepts**  
✅ **CDS detects PHI → Creates incident**  
✅ **Admin approves in CDS portal**  
✅ **Status changes to released/rejected**  
✅ **Message traces confirm delivery/blocking**  
✅ **Complete audit trail for compliance**

This demonstrates **Prevention by Design** - emails with PHI cannot leave the organization without explicit admin approval!
