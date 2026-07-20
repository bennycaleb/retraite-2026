require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'retraite2026';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const DATA_DIR = path.join(__dirname, 'data');
const JSON_FILE = path.join(DATA_DIR, 'registrations.json');
const CSV_FILE = path.join(DATA_DIR, 'registrations.csv');

const sessions = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont acceptées'));
  },
});

app.use(express.json());
app.use(express.static(__dirname));

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(JSON_FILE)) {
    fs.writeFileSync(JSON_FILE, '[]', 'utf8');
    syncCsv([]);
  }
}

function readRegistrations() {
  ensureDataFiles();
  return JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
}

function writeRegistrations(list) {
  fs.writeFileSync(JSON_FILE, JSON.stringify(list, null, 2), 'utf8');
  syncCsv(list);
}

const CSV_SEP = ';';
const CSV_BOM = '\uFEFF';

function escapeCsv(value) {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(CSV_SEP) || str.includes('\n') || str.includes(',')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvContent(list) {
  const headers = [
    'Date',
    'Prénom',
    'Nom',
    'Email',
    'Téléphone',
    'Remarques',
    'Partenaire',
    'Montant partenaire',
    'Total',
    'Attentes',
    'Preuve envoyée',
    'Date preuve',
    'Statut',
  ];

  const rows = list.map((r) =>
    [
      r.date,
      r.prenom,
      r.nom,
      r.email,
      r.telephone,
      r.remarques,
      r.partenaire ? 'Oui' : 'Non',
      r.montantPartenaire,
      r.total,
      r.attentes,
      r.preuveEnvoyee ? 'Oui' : 'Non',
      r.datePreuve || '',
      r.statut,
    ]
      .map(escapeCsv)
      .join(CSV_SEP)
  );

  return CSV_BOM + [headers.join(CSV_SEP), ...rows].join('\n');
}

function syncCsv(list) {
  fs.writeFileSync(CSV_FILE, buildCsvContent(list), 'utf8');
}

async function sendTelegramPhotoOnly(buffer, filename, mimetype) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram non configuré');
    return false;
  }

  const formData = new FormData();
  formData.append('chat_id', TELEGRAM_CHAT_ID);
  formData.append('photo', new Blob([buffer], { type: mimetype }), filename);

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    console.error('Erreur Telegram:', await res.text());
    return false;
  }

  return true;
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
}

// --- Public API ---

app.post('/api/inscriptions', upload.single('capture'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Capture de paiement requise' });
  }

  const {
    prenom,
    nom,
    email,
    telephone,
    remarques = '',
    partenaire,
    montantPartenaire = '0',
    total,
    attentes,
  } = req.body;

  if (!prenom || !nom || !email || !telephone || !total || !attentes) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  const now = new Date().toISOString();
  const registration = {
    id: crypto.randomUUID(),
    date: now,
    prenom: prenom.trim(),
    nom: nom.trim(),
    email: email.trim(),
    telephone: telephone.trim(),
    remarques: (remarques || '').trim(),
    partenaire: partenaire === 'true' || partenaire === true,
    montantPartenaire: Number(montantPartenaire) || 0,
    total: Number(total),
    attentes: attentes.trim(),
    preuveEnvoyee: true,
    datePreuve: now,
    statut: 'En attente',
  };

  const list = readRegistrations();
  list.unshift(registration);
  writeRegistrations(list);

  console.log("PHOTO RECUE :", req.file.originalname, req.file.mimetype, req.file.size);
  await sendTelegramPhotoOnly(
    req.file.buffer,
    req.file.originalname || 'preuve.jpg',
    req.file.mimetype
  );

  res.status(201).json({ success: true, id: registration.id });
});

// --- Admin API ---

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  res.json({ token });
});

app.get('/api/admin/inscriptions', requireAdmin, (req, res) => {
  res.json(readRegistrations());
});

app.patch('/api/admin/inscriptions/:id', requireAdmin, (req, res) => {
  const { statut } = req.body;

  if (statut !== 'Payé' && statut !== 'En attente') {
    return res.status(400).json({ error: 'Statut invalide' });
  }

  const list = readRegistrations();
  const index = list.findIndex((r) => r.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: 'Inscription introuvable' });
  }

  list[index].statut = statut;
  writeRegistrations(list);

  res.json({ success: true, registration: list[index] });
});

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const list = readRegistrations();
  const content = buildCsvContent(list);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="inscriptions.xls"');
  res.send(content);
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message === 'Seules les images sont acceptées') {
    return res.status(400).json({ error: err.message || 'Fichier invalide' });
  }
  res.status(500).json({ error: 'Erreur serveur' });
});

app.listen(PORT, () => {
  ensureDataFiles();
  console.log(`Serveur démarré → http://localhost:${PORT}`);
  console.log(`Admin → http://localhost:${PORT}/admin.html`);
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('⚠ Telegram non configuré — ajoutez TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID');
  }
});
