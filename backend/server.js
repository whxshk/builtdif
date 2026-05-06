import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';

const app = express();
app.use(cors({ origin: (_, cb) => cb(null, true) }));
app.use(express.json({ limit: '2mb' }));

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  const cfg = getSmtpConfig();
  let emailStatus = cfg ? 'configured' : 'not_configured';

  if (cfg) {
    try {
      const t = nodemailer.createTransport(cfg.transport);
      await Promise.race([
        t.verify(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      emailStatus = 'connected';
    } catch (e) {
      emailStatus = 'error';
    }
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    email_status: emailStatus,
    smtp_configured: !!cfg,
    smtp_from: cfg?.from_email ?? null,
  });
});

// ─── Ollama Models ────────────────────────────────────────────────────────────

app.get('/ollama/models', async (req, res) => {
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  try {
    const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`Ollama status ${r.status}`);
    const data = await r.json();
    res.json({ models: (data.models || []).map(m => m.name) });
  } catch (e) {
    res.status(503).json({ models: [], error: `Ollama not reachable at ${base}: ${e.message}` });
  }
});

// ─── Email Test ───────────────────────────────────────────────────────────────

app.post('/email/test', async (req, res) => {
  const cfg = getSmtpConfig();
  if (!cfg) {
    return res.status(400).json({
      ok: false,
      error: 'SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env file.',
    });
  }
  try {
    const t = nodemailer.createTransport(cfg.transport);
    await Promise.race([
      t.verify(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out after 10s')), 10000)),
    ]);
    res.json({ ok: true, from: cfg.from_email });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

// ─── Email Send ───────────────────────────────────────────────────────────────

app.post('/email/send', async (req, res) => {
  const { to, subject, body, from_name, from_email: reqFrom } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ ok: false, error: 'Missing required fields: to, subject, body' });
  }

  const recipient = to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return res.status(400).json({ ok: false, error: `Invalid recipient email: ${to}` });
  }

  const cfg = getSmtpConfig();
  if (!cfg) {
    return res.status(503).json({
      ok: false,
      error: 'SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS to the backend .env file and restart the service.',
    });
  }

  try {
    const transporter = nodemailer.createTransport(cfg.transport);
    const info = await transporter.sendMail({
      from: `${from_name || cfg.from_name} <${reqFrom || cfg.from_email}>`,
      to: recipient,
      subject,
      text: body,
      html: `<div style="font-family:sans-serif;line-height:1.6;">${body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>`,
    });
    console.log(`[email/send] Sent to ${recipient} — messageId: ${info.messageId}`);
    res.json({ ok: true, message_id: info.messageId });
  } catch (e) {
    console.error(`[email/send] Failed to ${recipient}:`, e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return {
    transport: {
      host,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    },
    from_email: process.env.SMTP_FROM_EMAIL || user,
    from_name: process.env.SMTP_FROM_NAME || 'RFxAI Outreach',
  };
}

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  const cfg = getSmtpConfig();
  console.log(`OutreachOS backend running on http://localhost:${PORT}`);
  console.log(`SMTP: ${cfg ? `configured (sending from ${cfg.from_email})` : 'NOT configured — set SMTP_HOST, SMTP_USER, SMTP_PASS'}`);
  console.log(`Ollama: ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}`);
});
