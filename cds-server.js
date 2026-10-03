/**
 * Clinical Data Sentinel - Backend Service
 * Node.js Express server with M365 integration
 * Captures emails from M365, detects PHI, stores incidents, serves dashboard API
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
      status TEXT DEFAULT 'pending'
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
    patient_name: /(?:patient|subject|name)[\s:]*([A-Z][a-z]+ [A-Z][a-z]+)/gi,
    patient_id: /(?:patient\s*id|MRN|medical\s*record|admission)[\s:]*([0-9]{4,})/gi,
    ssn: /(?:SSN|social\s*security|aadhar|pan)[\s:]*([0-9\-]+)/gi,
    diagnosis: /(?:diagnosis|condition|disease|covid|diabetes|cancer)[\s:]*([A-Z][a-z\s]+)/gi,
    medication: /(?:medication|prescribed|drug|medicine|tablet)[\s:]*([A-Z][a-z\s]+)/gi,
    insurance_details: /(?:insurance|policy|claim)[\s:]*([A-Z0-9\-]+)/gi,
    phone: /(?:phone|contact|mobile)[\s:]*(\+?[\d\s\-()]{10,})/gi,
    hospital_id: /(?:hospital|ward|bed|room)[\s:]*(?:id|no|number)[\s:]*([A-Z0-9\-]+)/gi
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

// API: Ingest email (from M365 or manual testing)
app.post('/api/ingest-email', (req, res) => {
  const { from, to, subject, body, emailId } = req.body;

  if (!from || !to || !subject || !body) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const phiAnalysis = detectPHI(body, subject);
  const isExternal = !to.match(/@hospital\.com|@internal\.|@m365x92216622\.onmicrosoft\.com/i);
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

// Function to fetch and process emails from M365
async function syncEmailsFromM365() {
  if (!m365Initialized) {
    console.log('M365 not initialized, skipping sync');
    return;
  }

  try {
    console.log('📧 Starting M365 email sync...');

    const token = await getM365Token();
    if (!token) {
      console.error('Failed to get M365 token');
      return;
    }

    const mailboxEmail = process.env.MAILBOX_EMAIL;
    if (!mailboxEmail) {
      console.error('MAILBOX_EMAIL not configured in .env');
      return;
    }

    // Fetch emails from the past 24 hours
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/messages?$filter=receivedDateTime ge ${new Date(Date.now() - 24*60*60*1000).toISOString()}&$select=id,from,toRecipients,subject,bodyPreview,body,receivedDateTime&$orderby=receivedDateTime desc&$top=50`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const emails = response.data.value || [];
    console.log(`Found ${emails.length} emails to process`);

    let processedCount = 0;

    for (const email of emails) {
      if (!email.body || !email.body.content) continue;

      const emailData = {
        emailId: email.id,
        from: email.from?.emailAddress?.address || 'unknown',
        to: email.toRecipients?.map(r => r.emailAddress.address).join(', ') || 'unknown',
        subject: email.subject || '(no subject)',
        body: email.body.content.substring(0, 5000)
      };

      const phi = detectPHI(emailData.body, emailData.subject);
      const isExt = !emailData.to.match(/@hospital\.com|@internal\.|@m365x92216622\.onmicrosoft\.com/i);
      const risk = stratifyRisk(phi.detected, phi.confidence, isExt);
      const comp = mapCompliance(risk, phi.phiTypes);

      db.run(
        `INSERT OR IGNORE INTO incidents
         (email_id, from_address, to_address, subject, phi_types, risk_level, dpdp_article, nabh_standard, confidence, raw_body)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          emailData.emailId,
          emailData.from,
          emailData.to,
          emailData.subject,
          phi.phiTypes.join(', '),
          risk,
          comp.dpdp,
          comp.nabh,
          phi.confidence,
          emailData.body
        ],
        (err) => {
          if (!err) processedCount++;
        }
      );
    }

    db.run(
      `INSERT INTO sync_status (last_sync, emails_processed, status)
       VALUES (datetime('now'), ?, 'success')`,
      [processedCount]
    );

    console.log(`✓ M365 sync complete: ${processedCount} new emails processed`);
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Clinical Data Sentinel Backend',
    m365_connected: m365Initialized
  });
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Clinical Data Sentinel - Backend Service                  ║
║  Running on http://localhost:${PORT}                            ║
║                                                            ║
║  API Endpoints:                                            ║
║  - GET  /api/incidents         (list all incidents)       ║
║  - GET  /api/incidents/:id     (incident details)         ║
║  - GET  /api/stats             (dashboard stats)          ║
║  - GET  /api/sync-status       (M365 sync status)         ║
║  - POST /api/ingest-email      (submit email for analysis)║
║  - POST /api/incidents/:id/action (take action on incident)║
║  - POST /api/sync-emails       (trigger M365 sync)        ║
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
