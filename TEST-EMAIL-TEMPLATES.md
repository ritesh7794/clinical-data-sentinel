# Clinical Data Sentinel - Test Email Templates
**October 16, 2026 - Demo Ready**

---

## 📧 Email 1: SAFE (Low Risk) - Use This First

**From:** `MeganB@M365x92216622.OnMicrosoft.com`  
**To:** `divineenergy88@gmail.com`  
**Subject:** `Q3 2026 Department Update`

**Body:**
```
Hi,

I wanted to share some updates on our department's quarterly performance.

The team has completed several standard administrative tasks this period:
- Updated employee records
- Processed routine documentation 
- Completed compliance training requirements

No specific patient or health information is included in this message.

Best regards,
Megan B.
Department Admin
```

**Expected Result:**
- ✓ Minimal PHI detected (if any)
- ✓ Low confidence score (20-40%)
- ✓ Marked as SAFE (green badge)
- ✓ May be released immediately

---

## 🚨 Email 2: ANOMALOUS (High Risk) - Medical Data - Send Second

**From:** `PradeepG@kloudeai.xyz`  
**To:** `divineenergy88@gmail.com`  
**Subject:** `URGENT: Patient Case Review - MRN-2024-87654`

**Body:**
```
CONFIDENTIAL MEDICAL RECORD

Patient Details:
- Name: John Smith
- Date of Birth: 12/05/1968
- Patient ID: MRN-2024-87654
- Age: 55 years old

Medical Diagnosis:
- Primary diagnosis: Type 2 Diabetes with hypertension
- Secondary diagnosis: Mild asthma

Current Medications:
- Medication 1: Metformin 500mg twice daily
- Medication 2: Lisinopril 10mg once daily
- Medication 3: Albuterol inhaler as needed

Insurance Details:
- Insurance Company: BlueCross BlueShield
- Policy Number: BCB-2024-567890
- Group Number: GRP-1234

Recent Lab Results:
- Glucose: 145 mg/dL (abnormal)
- Blood Pressure: 138/88 mmHg
- Cholesterol: 210 mg/dL

Hospital Admission:
- Hospital ID: HOSP-West-Room-302
- Ward: Cardiology Unit
- Bed Number: 12

Contact:
- Phone: +91-98765-43210

This patient requires urgent follow-up. Please review and advise on next steps.

Regards,
Dr. Pradeep G.
```

**Expected Result:**
- ✓ MULTIPLE PHI types detected:
  - patient_name ✓
  - dob ✓
  - patient_id/mrn ✓
  - diagnosis ✓
  - medication ✓
  - lab_result ✓
  - insurance_details ✓
  - hospital_id ✓
  - phone ✓
- ✓ HIGH confidence score (90-99%)
- ✓ **External recipient** (gmail.com)
- ✓ Marked as **ANOMALOUS** (🔴 red badge)
- ⏸️ Held for admin review
- ✓ Can be released by clicking "RELEASE APPROVED" button
- ✓ Email should NOT be delivered until SAFE button is clicked

---

## 🚨 Email 3: ANOMALOUS (Employee Data) - Alternative High Risk

**From:** `PradeepG@kloudeai.xyz`  
**To:** `divineenergy88@gmail.com`  
**Subject:** `CONFIDENTIAL: Staff Salary Review Q4 2026`

**Body:**
```
CONFIDENTIAL HR DOCUMENT

Employee Information:
- Employee Name: Pradeep Gupta
- Employee ID: HR-EMP-2024-4567
- Department: Medical Records

Compensation Details:
- Annual Salary: ₹18,50,000 (Rs 18.5 Lakhs)
- Monthly Salary: ₹154,166.67
- CTC (Cost to Company): ₹22,00,000
- Bonus: ₹2,00,000 (annual performance bonus)
- Increment: 8% approved for next review

Bank Account Information:
- Bank Name: HDFC Bank
- Account Number: 12345678901234
- IFSC Code: HDFC0001234
- Routing Number: 123456

SSN/Tax ID: 123-45-6789
PAN: ABCDE1234F

This salary information is strictly confidential and should not be shared externally.

HR Department
```

**Expected Result:**
- ✓ MULTIPLE PHI types detected:
  - employee_info ✓
  - salary ✓
  - bank_account ✓
  - ssn ✓
- ✓ HIGH confidence score (70-85%)
- ✓ **External recipient** (gmail.com)
- ✓ Marked as **ANOMALOUS** (🔴 red badge)
- ⏸️ Held for admin review

---

## 🔄 Email 4: REVIEW (Moderate Risk) - Internal Distribution

**From:** `MeganB@M365x92216622.OnMicrosoft.com`  
**To:** `anotherstaff@hospital.com` (INTERNAL)  
**Subject:** `Internal Staff Report - Clinical Summary`

**Body:**
```
Hi,

Please review the attached clinical summary for our records:

Patient Summary:
- Patient ID: MRN-2024-11111
- Age: 42 years old
- Date of Birth: 15/03/1982

Diagnosis: The patient presented with complaints of chest pain and was diagnosed with mild hypertension. Current treatment with medication is showing improvement.

Recommended follow-up: Monthly check-ups required.

Contact: +91-98765-12345

This is for internal hospital records only.

Best,
Megan
```

**Expected Result:**
- ✓ PHI detected (patient_id, age, dob, diagnosis, phone)
- ✓ Medium confidence (60-70%)
- ✓ **INTERNAL recipient** (@hospital.com)
- ✓ Marked as REVIEW (🟠 orange badge)
- ℹ️ May be allowed after admin review

---

## ✅ Recommended Demo Workflow

1. **Pre-Demo (Now):**
   - Ensure Railway deployment is active
   - Verify Azure credentials are set in Railway environment variables
   - Clear database: `DELETE FROM incidents` (optional, for clean demo)
   - Open CDS dashboard at https://cds.kloudeai.xyz

2. **Demo Start:**
   - Show empty dashboard (or existing incidents)
   - Send **Email #2** (ANOMALOUS - Medical Data)
   - Wait 5-10 seconds for detection
   - Incident appears on dashboard as 🔴 ANOMALOUS
   - Click "RELEASE APPROVED"
   - Show success message
   - Verify email in jury member's inbox

3. **Extended Demo (if time):**
   - Send **Email #1** (SAFE) - should appear with green badge, auto-approved
   - Or send **Email #3** (ANOMALOUS - Salary) - similar workflow to Email #2

4. **Post-Demo Verification:**
   - Check M365 Message Trace for FAILED (original) and DELIVERED (released) entries
   - Verify audit trail in incidents table

---

## 🎯 Key Points for Jury

✅ **Real-time Detection:** Incident appears within 5-10 seconds of sending
✅ **Accurate Classification:** Medical data correctly marked as ANOMALOUS
✅ **Admin Control:** Admin reviews and approves before external delivery
✅ **Compliance:** DPDP Article 8 violation detected and logged
✅ **Verification:** M365 Message Trace proves delivery control
✅ **Audit Trail:** Complete record of who approved and when

---

**Last Updated:** October 16, 2026, 2:00 AM IST  
**Status:** Ready for Demo
