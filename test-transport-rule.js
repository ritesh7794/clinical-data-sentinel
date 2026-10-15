#!/usr/bin/env node
/**
 * Transport Rule Webhook Test Script
 * Simulates M365 Exchange Transport Rule calling the CDS webhook
 * Tests the email hold, release, and reject workflow
 */

const axios = require('axios');

// Configuration
const API_BASE = process.env.API_BASE || 'http://localhost:5000/api';
const WEBHOOK_URL = `${API_BASE}/webhook/check-email-safety`;

// Test email cases
const testCases = [
  {
    name: 'PHI to External - HIGH RISK (Should HOLD)',
    from: 'doctor.john@hospital.local',
    to: 'patient@gmail.com',
    subject: 'Patient Medical Records - URGENT',
    body: `
      Hi Sarah,

      Here are the records for your consultation:
      - Aadhar: 234567891234
      - MRN: MRN-2024-098765
      - DOB: 15/03/1985
      - Phone: +91-9876543210
      - Policy #: POL-2024-456789

      Please review and confirm receipt.

      Dr. John Smith
      Internal Medicine
    `
  },
  {
    name: 'Safe Email - Internal (Should ALLOW)',
    from: 'admin@hospital.local',
    to: 'all-staff@hospital.local',
    subject: 'Weekly Team Meeting Reminder',
    body: `
      Hi Team,

      Don't forget about our weekly sync on Thursday at 2 PM.
      Conference room: Building B, Room 204

      See you there!
      Management
    `
  },
  {
    name: 'MRN to External - MEDIUM RISK (Should HOLD)',
    from: 'nurse.sarah@clinic.local',
    to: 'external.partner@healthcare.com',
    subject: 'Patient Follow-up Data',
    body: `
      Hi,

      Medical Record Number: MRN-2024-555123
      Patient SSN: 123-45-6789

      Please confirm receipt of this information.

      Regards
    `
  }
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function testWebhook(testCase) {
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.bright}Test: ${testCase.name}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}`);

  console.log(`From: ${testCase.from}`);
  console.log(`To: ${testCase.to}`);
  console.log(`Subject: ${testCase.subject}\n`);

  try {
    const response = await axios.post(WEBHOOK_URL, {
      from: testCase.from,
      to: testCase.to,
      subject: testCase.subject,
      body: testCase.body,
      messageId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });

    const data = response.data;

    console.log(`${colors.bright}Webhook Response:${colors.reset}`);
    console.log(`  Action: ${data.action}`);
    console.log(`  Allow: ${data.allow ? colors.green + 'YES ✓' : colors.red + 'NO ✕'}${colors.reset}`);
    console.log(`  Risk Level: ${data.risk_level.toUpperCase()}`);
    console.log(`  Confidence: ${data.confidence}%`);
    console.log(`  PHI Detected: ${data.phi_detected.join(', ') || 'None'}`);
    console.log(`  Incident ID: ${colors.bright}${data.incident_id}${colors.reset}`);

    if (!data.allow) {
      console.log(`\n${colors.yellow}📋 Email HELD in quarantine - Awaiting admin action${colors.reset}`);
      console.log(`${colors.yellow}Steps for demo:${colors.reset}`);
      console.log(`  1. Go to CDS Dashboard → Incidents`);
      console.log(`  2. Click incident #${data.incident_id}`);
      console.log(`  3. Choose RELEASE (to send) or REJECT (to block)`);
      console.log(`  4. System logs the decision in audit trail`);
    } else {
      console.log(`\n${colors.green}✅ Email ALLOWED - Proceeding to external recipient${colors.reset}`);
    }

    return data.incident_id;
  } catch (error) {
    console.error(`${colors.red}❌ Webhook Error:${colors.reset}`, error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
    return null;
  }
}

async function releaseEmail(incidentId) {
  console.log(`\n${colors.cyan}Releasing email (Incident #${incidentId})...${colors.reset}`);

  try {
    const response = await axios.post(`${API_BASE}/incidents/${incidentId}/release-email`, {
      admin: 'Test Admin',
      reason: 'Approved after manual review'
    });

    console.log(`${colors.green}${response.data.message}${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}Error releasing email:${colors.reset}`, error.message);
    return false;
  }
}

async function rejectEmail(incidentId) {
  console.log(`\n${colors.cyan}Rejecting email (Incident #${incidentId})...${colors.reset}`);

  try {
    const response = await axios.post(`${API_BASE}/incidents/${incidentId}/reject-email`, {
      admin: 'Test Admin',
      reason: 'Blocked - Policy violation'
    });

    console.log(`${colors.red}${response.data.message}${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}Error rejecting email:${colors.reset}`, error.message);
    return false;
  }
}

async function runTests() {
  console.log(`\n${colors.bright}${colors.blue}
╔═══════════════════════════════════════════════════════════════════════════════╗
║          CLINICAL DATA SENTINEL - TRANSPORT RULE WEBHOOK TEST SUITE            ║
║                                                                               ║
║ Testing the DLP/Transport Rule email quarantine and admin approval workflow   ║
║ Email hold → Admin review in portal → Release/Reject decision                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝${colors.reset}
  `);

  console.log(`Webhook Endpoint: ${colors.bright}${WEBHOOK_URL}${colors.reset}\n`);

  const results = [];

  // Run all test cases
  for (const testCase of testCases) {
    const incidentId = await testWebhook(testCase);
    results.push({ testCase, incidentId });

    // Add a small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Demonstrate release workflow on first held email
  console.log(`\n${colors.bright}${colors.blue}
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     DEMO: ADMIN APPROVAL WORKFLOW                             ║
║                                                                               ║
║ Simulating admin reviewing a held email in the CDS portal and releasing it    ║
╚═══════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const heldEmail = results.find(r => r.incidentId && !r.testCase.name.includes('Internal'));
  if (heldEmail) {
    await releaseEmail(heldEmail.incidentId);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Demonstrate reject workflow on second held email
  if (results.length > 2) {
    const secondHeld = results.find((r, idx) =>
      r.incidentId && idx > 0 && !r.testCase.name.includes('Internal')
    );
    if (secondHeld) {
      await rejectEmail(secondHeld.incidentId);
    }
  }

  // Summary
  console.log(`\n${colors.bright}${colors.blue}
╔═══════════════════════════════════════════════════════════════════════════════╗
║                            TEST SUMMARY                                       ║
╚═══════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const held = results.filter(r => r.incidentId && r.testCase.name.includes('HOLD'));
  const allowed = results.filter(r => r.testCase.name.includes('ALLOW'));

  console.log(`Total Tests: ${results.length}`);
  console.log(`${colors.red}Emails HELD (awaiting approval): ${held.length}${colors.reset}`);
  console.log(`${colors.green}Emails ALLOWED: ${allowed.length}${colors.reset}`);

  console.log(`\n${colors.cyan}Next Steps:${colors.reset}`);
  console.log(`1. Open CDS Dashboard at http://localhost:5000/dashboard`);
  console.log(`2. Check "Incidents" tab to see held emails`);
  console.log(`3. Click each incident to view AI analysis`);
  console.log(`4. Click "Release to Send" or "Reject (Don't Send)"`);
  console.log(`5. Verify status changes to "released" or "rejected" in audit trail`);
  console.log(`\n${colors.bright}Demo Ready for Jury! 🎉${colors.reset}\n`);
}

// Run tests
runTests().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
