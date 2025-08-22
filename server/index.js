import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import Twilio from 'twilio';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Simple JSON "DB"
const DATA_DIR = path.join(process.cwd(), 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const CALLS_FILE = path.join(DATA_DIR, 'calls.json');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, '[]');
if (!fs.existsSync(CALLS_FILE)) fs.writeFileSync(CALLS_FILE, '[]');
if (!fs.existsSync(CAMPAIGNS_FILE)) fs.writeFileSync(CAMPAIGNS_FILE, '[]');

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Multer for CSV upload
const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

// Twilio client (only initialized if creds present)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// --- API ---

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Upload leads CSV
app.post('/api/leads/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const rows = [];
  const parser = fs.createReadStream(req.file.path).pipe(parse({ columns: true, skip_empty_lines: true }));

  for await (const record of parser) {
    // Expected columns: name, phone, company, email (flexible)
    rows.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      name: record.name || '',
      phone: record.phone || record.mobile || record.number || '',
      company: record.company || '',
      email: record.email || '',
      status: 'pending',
      notes: []
    });
  }

  const leads = readJSON(LEADS_FILE);
  leads.push(...rows);
  writeJSON(LEADS_FILE, leads);

  fs.unlinkSync(req.file.path);
  res.json({ imported: rows.length });
});

// List leads
app.get('/api/leads', (req, res) => {
  const leads = readJSON(LEADS_FILE);
  res.json({ leads });
});

// Create campaign
app.post('/api/campaigns', (req, res) => {
  const { name = 'Default Campaign', script = 'Hello, this is our AI assistant...', maxConcurrent = 3 } = req.body || {};
  const campaigns = readJSON(CAMPAIGNS_FILE);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const campaign = { id, name, script, maxConcurrent, createdAt: new Date().toISOString(), status: 'ready' };
  campaigns.push(campaign);
  writeJSON(CAMPAIGNS_FILE, campaigns);
  res.json({ campaign });
});

// Start campaign
app.post('/api/campaigns/:id/start', async (req, res) => {
  const { id } = req.params;
  const campaigns = readJSON(CAMPAIGNS_FILE);
  const campaign = campaigns.find(c => c.id === id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  campaign.status = 'running';
  writeJSON(CAMPAIGNS_FILE, campaigns);
  runDialerLoop(campaign.id);
  res.json({ ok: true });
});

// Campaign status
app.get('/api/campaigns/:id', (req, res) => {
  const campaigns = readJSON(CAMPAIGNS_FILE);
  const campaign = campaigns.find(c => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const calls = readJSON(CALLS_FILE).filter(x => x.campaignId === campaign.id);
  res.json({ campaign, calls });
});

// --- Dialer Loop (naive scheduler) ---
const activeLoops = new Map();

async function runDialerLoop(campaignId) {
  if (activeLoops.has(campaignId)) return; // already running
  console.log('Starting dialer loop for', campaignId);
  const interval = setInterval(async () => {
    const campaigns = readJSON(CAMPAIGNS_FILE);
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign || campaign.status !== 'running') {
      clearInterval(interval);
      activeLoops.delete(campaignId);
      console.log('Stopped dialer loop for', campaignId);
      return;
    }

    const calls = readJSON(CALLS_FILE);
    const inProgress = calls.filter(c => c.campaignId === campaignId && c.status === 'in_progress').length;
    if (inProgress >= (campaign.maxConcurrent || 3)) return;

    // pick next pending lead
    const leads = readJSON(LEADS_FILE);
    const next = leads.find(l => l.status === 'pending');
    if (!next) {
      campaign.status = 'completed';
      writeJSON(CAMPAIGNS_FILE, campaigns);
      console.log('Campaign completed (no more leads)');
      clearInterval(interval);
      activeLoops.delete(campaignId);
      return;
    }

    // Mark lead in progress
    next.status = 'dialing';
    writeJSON(LEADS_FILE, leads);
    placeCall(campaign, next).catch(err => console.error('placeCall error', err));
  }, 1000);
  activeLoops.set(campaignId, interval);
}

// Place a call (Twilio placeholder + mock qualification)
async function placeCall(campaign, lead) {
  const calls = readJSON(CALLS_FILE);
  const callId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  calls.push({ id: callId, campaignId: campaign.id, leadId: lead.id, phone: lead.phone, status: 'in_progress', createdAt: new Date().toISOString(), log: [] });
  writeJSON(CALLS_FILE, calls);

  // If Twilio client is configured, place a real call using <TwiML> that connects to your AI endpoint.
  if (twilioClient && process.env.TWILIO_CALLER_ID) {
    try {
      // Minimal example: call that plays a message (replace with your TwiML webhook that streams audio to your AI)
      const call = await twilioClient.calls.create({
        to: lead.phone,
        from: process.env.TWILIO_CALLER_ID,
        twiml: `<Response><Say>Hi ${lead.name || ''}, this is your AI assistant. This is a demo call.</Say><Pause length="1"/></Response>`
      });
      appendCallLog(callId, `Twilio call initiated: ${call.sid}`);
      await mockConversation(callId, lead); // replace with real Realtime GPT pipeline
    } catch (e) {
      appendCallLog(callId, `Twilio error: ${e.message}`);
      markLead(lead.id, 'failed');
      markCall(callId, 'failed');
      return;
    }
  } else {
    // No Twilio creds → simulate a call for demo
    appendCallLog(callId, 'Simulated call started (no Twilio credentials set)');
    await mockConversation(callId, lead);
  }

  // Mock qualification result
  const qualified = Math.random() > 0.4;
  markLead(lead.id, qualified ? 'qualified' : 'not_interested');
  markCall(callId, 'completed', qualified ? 'qualified' : 'not_interested');
}

function appendCallLog(callId, message) {
  const calls = readJSON(CALLS_FILE);
  const c = calls.find(x => x.id === callId);
  if (!c) return;
  c.log.push({ ts: new Date().toISOString(), message });
  writeJSON(CALLS_FILE, calls);
}

function markLead(leadId, status) {
  const leads = readJSON(LEADS_FILE);
  const l = leads.find(x => x.id === leadId);
  if (!l) return;
  l.status = status;
  writeJSON(LEADS_FILE, leads);
}

function markCall(callId, status, disposition='') {
  const calls = readJSON(CALLS_FILE);
  const c = calls.find(x => x.id === callId);
  if (!c) return;
  c.status = status;
  c.disposition = disposition;
  writeJSON(CALLS_FILE, calls);
}

async function mockConversation(callId, lead) {
  appendCallLog(callId, `Conversing with ${lead.name || 'lead'}...`);
  await new Promise(r => setTimeout(r, 1500));
  appendCallLog(callId, 'Asked qualifying questions...');
  await new Promise(r => setTimeout(r, 1200));
  appendCallLog(callId, 'Captured responses and scored lead...');
}

// Serve client (optional if hosting together)
app.use(express.static(path.join(process.cwd(), '..', 'client')));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
