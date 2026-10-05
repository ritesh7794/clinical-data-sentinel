/**
 * Clinical Data Sentinel - Backend Service (Enhanced)
 * Node.js Express server with M365 integration
 * Captures emails from M365, detects PHI, stores incidents, serves dashboard API
 * ENHANCED: Multi-mailbox monitoring for sent items to external recipients
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { ClientSecretCredential } = require('@azure/identity');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const dbPath = path.join(__dirname, 'incidents.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Connected to SQLite database');
});

// Create tables if they don't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id TEXT UNIQUE,
      from_address TEXT,
      to_address TEXT,
      subject TEXT,
      phi_types TEXT,
      risk_level TEXT,
      dpdp_article TEXT,
      nabh_standard TEXT,
      confidence INTEGER,
      raw_body TEXT,
      captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      email_source TEXT DEFAULT 'sync'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER,
      action TEXT,
      reason TEXT,
      taken_by TEXT,
      taken_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_sync DATETIME,
      emails_processed INTEGER DEFAULT 0,
      status TEXT DEFAULT 'idle'
    )
  `);
});

// M365 Graph Client Setup
let m365Initialized = false;
let m365Token = null;
let m365TokenExpiry = 0;

async function getM365Token() {
  try {
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      console.warn('M365 credentials not configured');
      return null;
    }

    // Check if token is still valid
    if (m365Token && Date.now() < m365TokenExpiry) {
      return m365Token;
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const token = await credential.getToken('https://graph.microsoft.com/.default');

    m365Token = token.token;
    m365TokenExpiry = token.expiresOnTimestamp;

    return m365Token;
  } catch (error) {
    console.error('Error getting M365 token:', error.message);
    return null;
  }
}

async function initializeM365Client() {
  try {
    const token = await getM365Token();
    if (token) {
      console.log('✓ M365 Graph Client initialized successfully');
      m365Initialized = true;
      return true;
    }
    return false;
  } catch (error) {
    console.error('✗ Failed to initialize M365 Graph Client:', error.message);
    return false;
  }
}

// PHI Detection Engine
function detectPHI(emailBody, emailSubject) {
  const patterns = {
    patient_name: /(?:patient|subject|name)[\s:]*([a-z][a-z]+ [a-z][a-z]+)/i,
    patient_id: /(?:patient\s*id|mrn|medical\s*record|admission)[\s:]*([0-9]{4,})/i,
    ssn: /(?:ssn|social\s*security|aadhar|pan)[\s:]*([0-9\-]+)/i,
    diagnosis: /(?:diagnosis|condition|disease|covid|diabetes|cancer)[\s:]*([a-z][a-z\s]+)/i,
    medication: /(?:medication|prescribed|drug|medicine|tablet)[\s:]*([a-z][a-z\s]+)/i,
    insurance_details: /(?:insurance|policy|claim)[\s:]*([a-z0-9\-]+)/i,
    phone: /(?:phone|contact|mobile)[\s:]*(\+?[\d\s\-()]{10,})/i,
    hospital_id: /(?:hospital|ward|bed|room)[\s:]*(?:id|no|number)[\s:]*([a-z0-9\-]+)/i
  };

  const fullText = `${emailSubject} ${emailBody}`.toLowerCase();
  let detectedTypes = [];
  let confidence = 0;

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(fullText)) {
      detectedTypes.push(type);
      confidence += 12;
    }
  }

  if (!emailBody.match(/@hospital\.com|@internal\.|@m365x92216622\.onmicrosoft\.com/i)) {
    confidence += 25;
  }

  confidence = Math.min(confidence, 99);

  return {
    phiTypes: detectedTypes.length > 0 ? detectedTypes : ['none'],
    confidence: confidence || 0,
    detected: detectedTypes.length > 0
  };
}

// Risk Stratification
function stratifyRisk(phiDetected, confidence, isExternal) {
  if (!phiDetected) return 'safe';
  if (isExternal && confidence >= 85) return 'anomalous';
  if (confidence >= 80) return 'review';
  return 'safe';
}

// Map to compliance standards
function mapCompliance(riskLevel, phiTypes) {
  const mappings = {
    safe: { dpdp: 'Article 6', nabh: 'Standard 1.4' },
    review: { dpdp: 'Article 8', nabh: 'Standard 2.3' },
    anomalous: { dpdp: 'Article 8', nabh: 'Standard 3.1' }
  };
  return mappings[riskLevel] || mappings.safe;
}

// Check if recipient is external
function isExternalRecipient(recipientEmail) {
  if (!recipientEmail) return true;
  return !recipientEmail.match(/@hospital\.com|@internal\.|@m365x92216622\.onmicrosoft\.com/i);
}

// Get all users in organization
async function getOrganizationUsers(token) {
  try {
    const response = await axios.get(
      'https://graph.microsoft.com/v1.0/users?$select=id,userPrincipalName,displayName&$top=100',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.value || [];
  } catch (error) {
    console.error('Error fetching organization users:', error.message);
    return [];
  }
}

// Get sent emails from user's mailbox
async function getUserSentEmails(token, userEmail) {
  try {
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${userEmail}/mailFolders/sentitems/messages?$filter=sentDateTime ge ${new Date(Date.now() - 24*60*60*1000).toISOString()}&$select=id,from,toRecipients,subject,body,sentDateTime&$orderby=sentDateTime desc&$top=50`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.value || [];
  } catch (error) {
    console.error(`Error fetching sent emails for ${userEmail}:`, error.message);
    return [];
  }
}

// API: Get all incidents
app.get('/api/incidents', (req, res) => {
  db.all(`
    SELECT * FROM incidents
    ORDER BY captured_at DESC
    LIMIT 100
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// API: Get incident details
app.get('/api/incidents/:id', (req, res) => {
  db.get(
    'SELECT * FROM incidents WHERE id = ?',
    [req.params.id],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(row);
    }
  );
});

// API: Get dashboard stats
app.get('/api/stats', (req, res) => {
  db.all(`
    SELECT risk_level, COUNT(*) as count FROM incidents
    GROUP BY risk_level
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    let stats = {
      total: 0,
      safe: 0,
      review: 0,
      anomalous: 0,
      m365_connected: m365Initialized
    };

    rows.forEach(row => {
      stats[row.risk_level] = row.count;
      stats.total += row.count;
    });

    res.json(stats);
  });
});

// API: Get detailed analytics
app.get('/api/analytics', (req, res) => {
  Promise.all([
    // Risk level distribution
    new Promise((resolve) => {
      db.all(`
        SELECT risk_level, COUNT(*) as count FROM incidents
        GROUP BY risk_level
      `, (err, rows) => resolve(rows || []));
    }),
    // PHI types breakdown
    new Promise((resolve) => {
      db.all(`
        SELECT phi_types, COUNT(*) as count FROM incidents
        WHERE phi_types IS NOT NULL
        GROUP BY phi_types
        ORDER BY count DESC
        LIMIT 10
      `, (err, rows) => resolve(rows || []));
    }),
    // Top senders
    new Promise((resolve) => {
      db.all(`
        SELECT from_address, COUNT(*) as count FROM incidents
        GROUP BY from_address
        ORDER BY count DESC
        LIMIT 10
      `, (err, rows) => resolve(rows || []));
    }),
    // External vs Internal
    new Promise((resolve) => {
      db.all(`
        SELECT
          CASE WHEN to_address LIKE '%@%' AND to_address NOT LIKE '%kloudeai%'
               THEN 'External'
               ELSE 'Internal'
          END as recipient_type,
          COUNT(*) as count
        FROM incidents
        GROUP BY recipient_type
      `, (err, rows) => resolve(rows || []));
    }),
    // Average confidence by risk level
    new Promise((resolve) => {
      db.all(`
        SELECT risk_level,
               ROUND(AVG(confidence), 1) as avg_confidence,
               COUNT(*) as count
        FROM incidents
        GROUP BY risk_level
      `, (err, rows) => resolve(rows || []));
    })
  ]).then(([riskDist, phiTypes, topSenders, recipients, confidence]) => {
    res.json({
      risk_distribution: riskDist,
      phi_types_breakdown: phiTypes,
      top_senders: topSenders,
      recipient_types: recipients,
      confidence_by_risk: confidence,
      timestamp: new Date()
    });
  });
});

// API: Get sync status
app.get('/api/sync-status', (req, res) => {
  db.get(`
    SELECT * FROM sync_status
    ORDER BY last_sync DESC
    LIMIT 1
  `, (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(row || { status: 'never', last_sync: null, emails_processed: 0 });
  });
});

// API: Submit action on incident
app.post('/api/incidents/:id/action', (req, res) => {
  const { action, reason } = req.body;
  const incidentId = req.params.id;

  db.run(
    'INSERT INTO actions (incident_id, action, reason, taken_by) VALUES (?, ?, ?, ?)',
    [incidentId, action, reason, 'admin@hospital.com'],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      db.run(
        'UPDATE incidents SET status = ? WHERE id = ?',
        [action, incidentId],
        (err) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          res.json({ success: true, incidentId, action });
        }
      );
    }
  );
});

// API: Get action history for an incident
app.get('/api/incidents/:id/actions', (req, res) => {
  db.all(
    'SELECT * FROM actions WHERE incident_id = ? ORDER BY taken_at DESC',
    [req.params.id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows || []);
    }
  );
});

// API: Ingest email (from M365 or manual testing)
app.post('/api/ingest-email', (req, res) => {
  const { from, to, subject, body, emailId } = req.body;

  if (!from || !to || !subject || !body) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const phiAnalysis = detectPHI(body, subject);
  const isExternal = isExternalRecipient(to);
  const riskLevel = stratifyRisk(phiAnalysis.detected, phiAnalysis.confidence, isExternal);
  const compliance = mapCompliance(riskLevel, phiAnalysis.phiTypes);

  db.run(
    `INSERT INTO incidents
     (email_id, from_address, to_address, subject, phi_types, risk_level, dpdp_article, nabh_standard, confidence, raw_body)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      emailId || `${Date.now()}`,
      from,
      to,
      subject,
      phiAnalysis.phiTypes.join(', '),
      riskLevel,
      compliance.dpdp,
      compliance.nabh,
      phiAnalysis.confidence,
      body
    ],
    function(err) {
      if (err && err.message.includes('UNIQUE')) {
        res.status(409).json({ error: 'Email already processed' });
        return;
      }
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      res.json({
        success: true,
        incident: {
          id: this.lastID,
          from,
          to,
          subject,
          phiTypes: phiAnalysis.phiTypes,
          riskLevel,
          dpdpArticle: compliance.dpdp,
          nabhStandard: compliance.nabh,
          confidence: phiAnalysis.confidence
        }
      });
    }
  );
});

// ENHANCED: Function to monitor all sent emails to external recipients
async function syncEmailsFromM365() {
  if (!m365Initialized) {
    console.log('M365 not initialized, skipping sync');
    return;
  }

  try {
    console.log('📧 Starting comprehensive M365 email sync (inbox + sent items)...');

    const token = await getM365Token();
    if (!token) {
      console.error('Failed to get M365 token');
      return;
    }

    let totalProcessed = 0;

    // PART 1: Monitor specific admin mailbox (existing logic)
    const adminMailbox = process.env.MAILBOX_EMAIL;
    if (adminMailbox) {
      console.log(`📬 Scanning admin mailbox: ${adminMailbox}`);
      const adminEmails = await getUserSentEmails(token, adminMailbox);

      for (const email of adminEmails) {
        if (!email.body || !email.body.content) continue;

        const to = email.toRecipients?.map(r => r.emailAddress.address).join(', ') || 'unknown';

        // Only capture if sent to external recipients
        if (isExternalRecipient(to)) {
          const phi = detectPHI(email.body.content, email.subject);
          if (phi.detected) {
            const isExt = isExternalRecipient(to);
            const risk = stratifyRisk(phi.detected, phi.confidence, isExt);
            const comp = mapCompliance(risk, phi.phiTypes);

            db.run(
              `INSERT OR IGNORE INTO incidents
               (email_id, from_address, to_address, subject, phi_types, risk_level, dpdp_article, nabh_standard, confidence, raw_body)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                email.id,
                email.from?.emailAddress?.address || 'unknown',
                to,
                email.subject || '(no subject)',
                phi.phiTypes.join(', '),
                risk,
                comp.dpdp,
                comp.nabh,
                phi.confidence,
                email.body.content.substring(0, 5000)
              ],
              (err) => {
                if (!err) totalProcessed++;
              }
            );
          }
        }
      }
    }

    // PART 2: ENHANCED - Monitor all organization users' sent items
    console.log('👥 Fetching organization users...');
    const users = await getOrganizationUsers(token);
    console.log(`Found ${users.length} users in organization`);

    for (const user of users) {
      try {
        const sentEmails = await getUserSentEmails(token, user.userPrincipalName);

        for (const email of sentEmails) {
          if (!email.body || !email.body.content) continue;

          const to = email.toRecipients?.map(r => r.emailAddress.address).join(', ') || 'unknown';

          // Only capture emails sent to EXTERNAL recipients
          if (isExternalRecipient(to)) {
            const phi = detectPHI(email.body.content, email.subject);

            // Flag ALL PHI in external emails, not just high confidence
            if (phi.detected) {
              const isExt = true; // Always external
              const risk = stratifyRisk(phi.detected, phi.confidence, isExt);
              const comp = mapCompliance(risk, phi.phiTypes);

              db.run(
                `INSERT OR IGNORE INTO incidents
                 (email_id, from_address, to_address, subject, phi_types, risk_level, dpdp_article, nabh_standard, confidence, raw_body)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  `${user.userPrincipalName}-${email.id}`,
                  email.from?.emailAddress?.address || user.userPrincipalName,
                  to,
                  email.subject || '(no subject)',
                  phi.phiTypes.join(', '),
                  risk,
                  comp.dpdp,
                  comp.nabh,
                  phi.confidence,
                  email.body.content.substring(0, 5000)
                ],
                (err) => {
                  if (!err) totalProcessed++;
                }
              );
            }
          }
        }
      } catch (userError) {
        console.log(`⚠️ Could not access emails for ${user.userPrincipalName}: ${userError.message}`);
      }
    }

    db.run(
      `INSERT INTO sync_status (last_sync, emails_processed, status)
       VALUES (datetime('now'), ?, 'success')`,
      [totalProcessed]
    );

    console.log(`✓ Comprehensive M365 sync complete: ${totalProcessed} emails with PHI detected`);
  } catch (error) {
    console.error('✗ Error syncing emails from M365:', error.message);
    db.run(
      `INSERT INTO sync_status (last_sync, status)
       VALUES (datetime('now'), 'error')`
    );
  }
}

// API: Manually trigger M365 sync
app.post('/api/sync-emails', async (req, res) => {
  if (!m365Initialized) {
    res.status(503).json({ error: 'M365 not configured' });
    return;
  }

  res.json({ message: 'Sync initiated', timestamp: new Date() });
  await syncEmailsFromM365();
});

// API: Clear all incidents (for testing/reset)
app.delete('/api/incidents', (req, res) => {
  db.run('DELETE FROM incidents', (err) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'All incidents cleared', timestamp: new Date() });
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Clinical Data Sentinel Backend',
    m365_connected: m365Initialized,
    features: ['phi-detection', 'compliance-mapping', 'multi-mailbox-monitoring', 'analytics', 'action-tracking']
  });
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Clinical Data Sentinel - Backend Service (ENHANCED)       ║
║  Running on http://localhost:${PORT}                            ║
║                                                            ║
║  API Endpoints:                                            ║
║  - GET  /api/incidents         (list all incidents)       ║
║  - GET  /api/incidents/:id     (incident details)         ║
║  - GET  /api/stats             (dashboard stats)          ║
║  - GET  /api/analytics         (analytics & insights)     ║
║  - GET  /api/sync-status       (M365 sync status)         ║
║  - POST /api/ingest-email      (submit email for analysis)║
║  - POST /api/incidents/:id/action (take action on incident)║
║  - GET  /api/incidents/:id/actions (action history)       ║
║  - POST /api/sync-emails       (trigger M365 sync)        ║
║                                                            ║
║  ENHANCED FEATURES:                                        ║
║  ✓ Multi-mailbox monitoring                               ║
║  ✓ Sent items tracking (external recipients)              ║
║  ✓ Action history & tracking                              ║
║  ✓ Analytics dashboard with charts                        ║
║  ✓ Organization-wide coverage                             ║
║  ✓ 100% FREE - No third-party API costs                   ║
║                                                            ║
║  Next: Open http://localhost:${PORT} in your browser       ║
╚════════════════════════════════════════════════════════════╝
  `);

  const m365Ready = await initializeM365Client();

  if (m365Ready) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  M365 Integration Active                                   ║
║  Auto-syncing emails every 5 minutes                       ║
║  Monitoring: Inbox + All Sent Items (external recipients)  ║
╚════════════════════════════════════════════════════════════╝
    `);

    setTimeout(() => syncEmailsFromM365(), 3000);
    setInterval(syncEmailsFromM365, 5 * 60 * 1000);
  } else {
    console.log(`
⚠️  M365 Integration NOT Active
    Configure .env with M365 credentials to enable automatic email capture
    `);
  }
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
});

module.exports = app;
