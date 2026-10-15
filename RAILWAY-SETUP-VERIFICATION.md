# Railway Setup Verification - CRITICAL
**For October 16 Demo**

---

## 🎯 MUST VERIFY BEFORE DEMO

### Step 1: Open Railway Dashboard
```
URL: https://railway.app/dashboard
Login: Your Railway account
Project: clinical-data-sentinel
```

### Step 2: Check Deployment Status
```
Click: "Deployments" tab
Look at: LATEST deployment

SHOULD SHOW:
✓ Status badge: GREEN checkmark + "Deployment successful"
✓ Timestamp: October 16, 2026 (today)
✓ No error messages

IF RED/FAILED:
→ Click "View logs" 
→ Check for errors
→ Click "Redeploy" button
→ Wait 3-5 minutes
```

### Step 3: CHECK ENVIRONMENT VARIABLES (CRITICAL!)
```
Click: "Variables" tab on left sidebar
Scroll through and verify EACH variable is set:

REQUIRED FOR DEMO:
☐ AZURE_TENANT_ID = (should be a UUID like xxxxx-xxxxx-xxxxx-xxxxx-xxxxx)
☐ AZURE_CLIENT_ID = (should be a UUID)  
☐ AZURE_CLIENT_SECRET = (should be a long string)
☐ MAILBOX_EMAIL = admin@M365x92216622.onmicrosoft.com (or your mailbox)
☐ PORT = 5000
☐ NODE_ENV = production

If ANY are MISSING:
→ Add them now
→ Copy values from Azure Portal or your records
→ Click "Save changes"
→ Click "Redeploy" (should take 3-5 minutes)
→ Wait for green checkmark
```

### Step 4: Test Deployment is Running
```
In browser, visit:
https://cds.kloudeai.xyz/api/health

SHOULD SHOW JSON:
{
  "status": "ok",
  "service": "Clinical Data Sentinel Backend",
  "m365_connected": true,  ← THIS MUST BE TRUE
  "features": [...]
}

If m365_connected = false:
→ Azure variables not loaded
→ Go back to Step 3
→ Verify variables are set
→ Wait for redeploy to complete
```

### Step 5: Full Health Check
```
Visit:
https://cds.kloudeai.xyz/api/diagnostic/system-health

SHOULD SHOW:
{
  "status": "READY",  ← CRITICAL: Must be "READY"
  "credentials": {
    "AZURE_TENANT_ID": "✓ Set",
    "AZURE_CLIENT_ID": "✓ Set",
    "AZURE_CLIENT_SECRET": "✓ Set",
    "MAILBOX_EMAIL": "admin@M365x92216622.onmicrosoft.com"
  },
  "m365": {
    "initialized": true,  ← Must be true
    "token_available": true,  ← Must be true
    "token_valid_until": "2026-10-16T..."
  },
  "database": {
    "total": 0,
    "safe": 0,
    "review": 0,
    "anomalous": 0,
    "status": "Connected"
  }
}

If status = "MISSING_CREDENTIALS":
→ Go back to Step 3
→ Verify AZURE_* variables are saved
→ Check that redeploy finished (green checkmark)
→ Retest
```

---

## 🚨 SHOW STOPPERS

**FAIL: Any of these show as missing or false**
```
✗ AZURE_TENANT_ID not set
✗ AZURE_CLIENT_ID not set
✗ AZURE_CLIENT_SECRET not set
✗ m365_initialized = false
✗ token_available = false
✗ status = "MISSING_CREDENTIALS"
→ Demo CANNOT proceed - need credentials
```

**PASS: All look like this**
```
✓ All AZURE_* variables have values (not empty)
✓ m365_initialized = true
✓ token_available = true
✓ status = "READY"
✓ Deployment shows green checkmark
→ Demo is READY TO GO
```

---

## 🔍 If Something is Wrong

### Scenario 1: "Variables not saving"
```
1. Click on a variable value field
2. Clear it completely
3. Paste new value
4. Move to next field (must click away to save)
5. See blue "Reload to apply changes" button?
6. Click it
7. Wait 30 seconds
8. Refresh page
9. Value should be there
```

### Scenario 2: "Redeploy not working"
```
1. Deployments tab → Latest deployment
2. Click 3-dot menu (top right)
3. Select "Redeploy"
4. Watch status change:
   - First: "Building" (gray)
   - Then: "Deploying" (yellow)
   - Finally: "Deployment successful" (green) ← WAIT FOR THIS
5. If stuck on "Building" for >5 minutes:
   - Refresh page
   - Check Logs tab for errors
```

### Scenario 3: "Variables set but still failing"
```
1. Delete AZURE_CLIENT_SECRET
2. Redeploy
3. Wait for deployment to finish
4. Add AZURE_CLIENT_SECRET back
5. Redeploy again
6. This forces a fresh initialization
```

---

## ⏱️ TIMELINE FOR SETUP

**If all variables already set:**
- Step 1-5: ~2 minutes

**If variables need to be added:**
- Step 1-3: ~3 minutes
- Step 4 (Wait for redeploy): ~5 minutes
- Step 5: ~1 minute
- **Total: ~9 minutes**

**IF AZURE CREDENTIALS MISSING ENTIRELY:**
- Need to get from Azure Portal
- This is a SHOWSTOPPER - demo cannot happen
- Would need to create new Azure App Registration
- This takes 15-30 minutes

---

## ✅ FINAL SIGN-OFF

Before you tell the jury "ready":

```bash
# Copy this into your browser console (F12) or just visit the URL:

https://cds.kloudeai.xyz/api/diagnostic/system-health

# Look for:
# "status": "READY"
# "m365": { "initialized": true, "token_available": true }

# If you see both, say: "✅ System is READY for demo"
# If not, fix the variables and redeploy
```

---

**This is the SINGLE most critical piece for demo success**

No credentials = No email sending = No demo
