# Microsoft Graph Change Notifications - Setup Guide

**Status:** Production-ready for Clinical Data Sentinel M365 DLP  
**Last Updated:** October 15, 2026  
**Estimated Setup Time:** 15-20 minutes

---

## 📋 Overview

Instead of polling M365 Message Trace every 5 seconds, we use **Microsoft Graph Change Notifications** to get real-time push notifications when emails are rejected by the transport rule.

### How It Works

```
1. User sends email with PHI to external recipient
   ↓
2. M365 Transport Rule rejects the email
   ↓
3. Email appears in Message Trace with Status="Failed"
   ↓
4. Graph subscription triggers on mailbox activity
   ↓
5. Azure AD app queries Message Trace API
   ↓
6. Detects rejection → POSTs to CDS webhook
   ↓
7. CDS creates incident in production dashboard
   ↓
8. Admin reviews at https://cds.kloudeai.xyz
```

---

## 🔧 Prerequisites

✅ **You need:**
- Global Admin access to your M365 tenant
- PowerShell 7.0+ (installed)
- Git and local clinical-data-sentinel repo
- cds.kloudeai.xyz production endpoint confirmed working

---

## 📝 Step 1: Register Azure AD Application

This creates an identity for the Graph webhook bridge to authenticate with M365.

### 1.1 Go to Azure Portal

```
https://portal.azure.com → Azure Active Directory → App registrations → New registration
```

### 1.2 Fill in the Details

**Name:** `Clinical Data Sentinel Bridge`  
**Supported account types:** Single tenant (default)  
**Redirect URI:** (leave blank for now)

Click **Register** and copy the **Application (client) ID** — save it!

### 1.3 Create a Client Secret

In your new app registration:

```
Certificates & secrets → Client secrets → New client secret
```

**Description:** `CDS Bridge Secret`  
**Expires:** 24 months

Copy the **Value** immediately — you won't see it again!

### 1.4 Grant API Permissions

In your app registration:

```
API permissions → Add a permission → Microsoft Graph
```

Select **Application permissions** (not delegated):

```
✅ Mail.Read
✅ Mail.ReadWrite  
✅ Calendars.Read
✅ MailboxSettings.Read
```

Click **Grant admin consent** (you must be Global Admin)

---

## 💾 Step 2: Store Credentials in PowerShell

Create a secure credential file:

```powershell
# Run this ONCE to save your credentials
$tenantId = "your-tenant-id"  # e.g., contoso.onmicrosoft.com or UUID
$clientId = "your-app-id"      # Application (client) ID from Step 1.2
$clientSecret = "your-secret"  # Client secret value from Step 1.3
$cdsWebhookUrl = "https://cds.kloudeai.xyz/api/webhook/check-email-safety"

# Save to a local config file (NOT in git!)
$config = @{
    tenantId = $tenantId
    clientId = $clientId
    clientSecret = $clientSecret
    cdsWebhookUrl = $cdsWebhookUrl
}

$config | ConvertTo-Json | Out-File -Path "C:\Users\$env:USERNAME\cds-bridge-config.json" -Encoding UTF8
Write-Host "✅ Credentials saved to cds-bridge-config.json (not in git)"
```

**⚠️ IMPORTANT:** This file is NOT committed to git — it contains secrets!

---

## 📲 Step 3: Create Graph Subscription

Run this script to create the change notification subscription:

```powershell
# Load credentials
$config = Get-Content "C:\Users\$env:USERNAME\cds-bridge-config.json" | ConvertFrom-Json

# Connect to Graph API
$tokenUri = "https://login.microsoftonline.com/$($config.tenantId)/oauth2/v2.0/token"
$body = @{
    client_id     = $config.clientId
    client_secret = $config.clientSecret
    scope         = "https://graph.microsoft.com/.default"
    grant_type    = "client_credentials"
}

$token = Invoke-RestMethod -Uri $tokenUri -Method Post -Body $body
$headers = @{
    Authorization = "Bearer $($token.access_token)"
    "Content-Type" = "application/json"
}

# Create subscription to monitor mailbox
$subscriptionPayload = @{
    changeType = "created,updated"
    notificationUrl = "https://cds.kloudeai.xyz/api/webhook/graph-notifications"  # or your endpoint
    resource = "/me/mailFolderRootFolders('sentitems')/messages"
    expirationDateTime = (Get-Date).AddDays(2).ToString('o')
    clientState = "clinical-data-sentinel"
} | ConvertTo-Json

$subscription = Invoke-RestMethod `
    -Uri "https://graph.microsoft.com/v1.0/subscriptions" `
    -Method Post `
    -Headers $headers `
    -Body $subscriptionPayload

Write-Host "✅ Subscription created: $($subscription.id)"
Write-Host "   Resource: $($subscription.resource)"
Write-Host "   Expires: $($subscription.expirationDateTime)"
```

**This creates a subscription that notifies you when:**
- New emails arrive in Sent Items
- Existing emails are modified (status updated)

---

## 🚀 Step 4: Run the Graph Webhook Bridge

This script listens for Graph notifications and queries Message Trace:

```powershell
# Start monitoring
.\graph-webhook-listener.ps1

# Expected output:
# ✅ Connected to M365 via Graph API
# ✅ Subscription active: [subscription-id]
# 🟢 LISTENING for Graph change notifications...
```

The bridge:
1. Receives change notifications from Graph
2. Queries Message Trace API for rejection details
3. POSTs to CDS webhook when email is rejected
4. Creates incident in production dashboard

---

## ✅ Step 5: Demo Day (October 16)

### Pre-Demo Checklist

```powershell
# Terminal 1: Ensure CDS server is running
npm start  # from clinical-data-sentinel directory

# Terminal 2: Start Graph webhook listener
.\graph-webhook-listener.ps1

# Browser: Open dashboard
https://cds.kloudeai.xyz
```

### Live Demo Flow

1. **Show empty dashboard** (or current incident count)
2. **Open Outlook** → Send test email with PHI to external address
3. **Watch dashboard** → New incident appears in real-time
4. **Click incident** → Review AI analysis and PHI detected
5. **Click RELEASE** → Admin approves email
6. **Verify in M365** → Message Trace shows DELIVERED

---

## 🔍 Troubleshooting

### "Subscription already exists"

```powershell
# List all subscriptions
$subscriptions = Invoke-RestMethod `
    -Uri "https://graph.microsoft.com/v1.0/subscriptions" `
    -Headers $headers

$subscriptions.value | Select-Object id, resource, expirationDateTime
```

### "Graph notification not received"

1. Verify `notificationUrl` is publicly accessible
2. Check CDS server is running and webhook endpoint responds
3. Verify subscription has not expired

### "Message Trace query returns nothing"

1. Check email timestamp — Message Trace has 5-10 minute sync delay
2. Verify transport rule is enabled in M365
3. Check email actually went to external recipient

---

## 📊 Comparison: Graph vs. Polling Bridge

| Aspect | Graph Notifications | PowerShell Polling |
|--------|-------------------|------------------|
| **Detection Speed** | Real-time (< 1 second) | ~5 seconds |
| **Server Load** | Push-based (low) | Polling every 5s (medium) |
| **Cost** | Free | Free |
| **Reliability** | Subscription-based | Continuous script |
| **Setup Complexity** | Azure AD + subscription | PowerShell only |
| **Production Ready** | ✅ Yes | ✅ Yes |

---

## 🎓 What Happens Behind the Scenes

```
Graph Notification Flow:
─────────────────────

Email Sent → Transport Rule Rejects → M365 Message Trace Updated
                                            ↓
                              Graph detects change
                                            ↓
                     Graph sends POST to your webhook
                                            ↓
                        Bridge receives notification
                                            ↓
                      Bridge queries Message Trace API
                                            ↓
                         Email has Status="Failed"?
                                            ↓
                          YES → POST to CDS webhook
                                            ↓
                         CDS webhook creates incident
                                            ↓
                    Incident appears in dashboard ✅
```

---

## 📚 Resources

- [Microsoft Graph Change Notifications](https://learn.microsoft.com/en-us/graph/api/resources/webhooks)
- [Message Trace API Reference](https://learn.microsoft.com/en-us/graph/api/resources/message-trace)
- [Azure AD App Registration Guide](https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)

---

## ✨ Next Steps

1. ✅ Complete Steps 1-4 above
2. ✅ Run `graph-webhook-listener.ps1` in new PowerShell
3. ✅ Keep CDS server running: `npm start`
4. ✅ Open dashboard: https://cds.kloudeai.xyz
5. ✅ Send test email with PHI
6. ✅ Watch incident appear in real-time 🎯

**Questions?** Check the troubleshooting section or review the bridge script logs.

---

**Generated:** October 15, 2026  
**For:** Clinical Data Sentinel M365 DLP System  
**Demo Date:** October 16, 2026, 11:00 AM IST
