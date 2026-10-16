/**
 * Railway Database Reset & Test Incident Seeding
 * Run this from Railway console to clear old data and create proper test incidents
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to database
const dbPath = process.env.NODE_ENV === 'production' ? './incidents.db' : './incidents.db';
const db = new sqlite3.Database(dbPath);

console.log('[DB RESET] Starting database cleanup and seeding...\n');

// Step 1: Clear all existing incidents
db.run(`DELETE FROM incidents`, (err) => {
  if (err) {
    console.error('[DB RESET] Error deleting incidents:', err);
    process.exit(1);
  }
  console.log('[DB RESET] ✓ Cleared all old incidents');
  
  // Step 2: Create 4 test incidents with varied risk levels
  const testIncidents = [
    {
      email_id: 'test-safe-001',
      from: 'megan.brown@hospital.com',
      to: 'support@vendor.com',
      subject: 'Invoice Request',
      phi_types: 'none',
      risk_level: 'safe',
      dpdp: 'Article 6',
      nabh: 'Standard 1.4',
      confidence: 25,
      body: 'Hi, can you send me the invoice for last month services?',
      status: 'safe_approved',
      email_source: 'test'
    },
    {
      email_id: 'test-review-001',
      from: 'records@hospital.com',
      to: 'consultant@external-clinic.com',
      subject: 'Lab Results Discussion',
      phi_types: 'lab_result, patient_id',
      risk_level: 'review',
      dpdp: 'Article 8',
      nabh: 'Standard 2.3',
      confidence: 65,
      body: 'Patient ID: HR-2024-001, Lab result: Glucose 145 mg/dL. Needs review before external consultation.',
      status: 'pending_review',
      email_source: 'test'
    },
    {
      email_id: 'test-anomalous-001',
      from: 'pradeep@hospital.com',
      to: 'jury-member@gmail.com',
      subject: 'URGENT: Medical Records - John Smith',
      phi_types: 'patient_id, diagnosis, medication, lab_result, dob',
      risk_level: 'anomalous',
      dpdp: 'Article 8',
      nabh: 'Standard 3.1',
      confidence: 99,
      body: `CONFIDENTIAL MEDICAL RECORD
Patient: John Smith
Date of Birth: 12/05/1968
Patient ID: MRN-2024-87654
Diagnosis: Type 2 Diabetes with hypertension
Medication: Metformin 500mg twice daily, Lisinopril 10mg once daily
Lab Results: Glucose 145 mg/dL, Blood Pressure 138/88 mmHg
Contact: +91-98765-43210`,
      status: 'hold_transport',
      email_source: 'test'
    },
    {
      email_id: 'test-anomalous-002',
      from: 'pradeep@hospital.com',
      to: 'jury-member@gmail.com',
      subject: 'Employee Salary Review - John Doe',
      phi_types: 'employee_info, salary, ssn, bank_account',
      risk_level: 'anomalous',
      dpdp: 'Article 8',
      nabh: 'Standard 3.1',
      confidence: 85,
      body: `Employee Information:
Employee ID: HR-EMP-2024-4567
Name: John Doe
SSN: 123-45-6789
Salary: ₹18,50,000 per annum
Bank Account: 12345678901234
Department: Finance`,
      status: 'hold_transport',
      email_source: 'test'
    }
  ];

  let inserted = 0;
  testIncidents.forEach((inc, idx) => {
    db.run(
      `INSERT INTO incidents
       (email_id, from_address, to_address, subject, phi_types, risk_level,
        dpdp_article, nabh_standard, confidence, raw_body, status, email_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [inc.email_id, inc.from, inc.to, inc.subject, inc.phi_types, inc.risk_level,
       inc.dpdp, inc.nabh, inc.confidence, inc.body, inc.status, inc.email_source],
      function(err) {
        if (err) {
          console.error(`[DB RESET] Error inserting incident ${idx + 1}:`, err);
        } else {
          inserted++;
          console.log(`[DB RESET] ✓ Created incident #${this.lastID}: ${inc.subject} (${inc.risk_level})`);
        }
        
        if (inserted === testIncidents.length) {
          // Verify results
          db.all(`SELECT id, risk_level, confidence FROM incidents ORDER BY id`, (err, rows) => {
            if (err) {
              console.error('[DB RESET] Verification error:', err);
            } else {
              console.log('\n[DB RESET] ✓ Database seeding complete!');
              console.log('\nFinal incident distribution:');
              const counts = {};
              rows.forEach(row => {
                counts[row.risk_level] = (counts[row.risk_level] || 0) + 1;
              });
              Object.entries(counts).forEach(([level, count]) => {
                console.log(`  ${level}: ${count}`);
              });
            }
            db.close();
            process.exit(0);
          });
        }
      }
    );
  });
});
