const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const fs        = require('fs');
const crypto    = require('crypto');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
app.use(express.json({ limit: '10mb' }));

/* ── Persistent store ──────────────────────────────────────── */
const DATA_FILE = path.join(__dirname, 'data.json');
function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (_) {}
  return { instances: {}, scores: {} };
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8'); }
let store = loadData();
if (!store.instances) store.instances = {};
if (!store.scores)    store.scores    = {}; // username → all-time best score

/* ── Sessions ──────────────────────────────────────────────── */
const sessions = new Map();
function genToken() { return crypto.randomBytes(28).toString('hex'); }
function getSession(req) {
  const token = req.headers['x-token'] || req.query.token;
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || Date.now() > s.expiresAt) { sessions.delete(token); return null; }
  return s;
}
function requireInstance(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Login required' });
  const inst = store.instances[s.instanceId];
  if (!inst) return res.status(401).json({ error: 'Instance not found' });
  req.instanceId = s.instanceId;
  req.instance   = inst;
  next();
}

/* ── Static files ──────────────────────────────────────────── */
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('/', (_req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/', (_req, res) => res.sendFile(path.join(publicPath, 'ads.txt')));

/* ── TikTok username login ─────────────────────────────────── */
app.post('/api/login', (req, res) => {
  let { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username required' });
  username = username.replace(/^@/, '').trim().toLowerCase();
  if (!username) return res.status(400).json({ error: 'Username required' });
  if (!store.instances[username]) {
    store.instances[username] = { id: username, name: username, ttUsername: username,
      active: true, createdAt: Date.now(), expiresAt: Date.now() + 100 * 365 * 86_400_000 };
    saveData();
  }
  const inst = store.instances[username];
  const token = genToken();
  sessions.set(token, { instanceId: username, expiresAt: inst.expiresAt });
  res.json({ success: true, token, instanceId: username, playerName: username,
    ttUsername: inst.ttUsername });
});

/* ── Instance data ─────────────────────────────────────────── */
app.get('/api/data', requireInstance, (req, res) => {
  const inst = req.instance;
  res.json({ ttUsername: inst.ttUsername || '', playerName: inst.name || inst.id });
});

/* ── Leaderboard ───────────────────────────────────────────── */
app.get('/api/leaderboard', (_req, res) => {
  const top = Object.entries(store.scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([username, score]) => ({ username, score }));
  res.json({ top });
});

/* ── Score submission & retrieval ──────────────────────────── */
app.get('/api/score', requireInstance, (req, res) => {
  res.json({ best: store.scores[req.instanceId] || 0 });
});

app.post('/api/score', requireInstance, (req, res) => {
  const { score } = req.body || {};
  const s = Number(score);
  if (!s || s <= 0) return res.json({ ok: false });
  const username = req.instanceId;

  // Update in-memory best for this player
  if (!store.scores[username] || s > store.scores[username]) {
    store.scores[username] = s;

    // Only persist the top 3 — no point storing everyone else
    const top3 = Object.entries(store.scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const inTop3 = top3.some(([u]) => u === username);
    if (inTop3) {
      store.scores = Object.fromEntries(top3);
    } else {
      // Not in top 3 — keep top 3 on disk but keep full map in memory for this session
      // so the player's personal best still works during their session
    }
    saveData();
  }
  res.json({ ok: true, best: store.scores[username] || s });
});

/* ── TikTok connections ────────────────────────────────────── */
const tiktokConns = new Map();

function disconnectInstance(id) {
  const c = tiktokConns.get(id);
  if (c) { try { c.disconnect(); } catch (_) {} tiktokConns.delete(id); }
  broadcastToInstance(id, { type: 'status', status: 'disconnected', isLive: false });
}

app.post('/api/connect', requireInstance, async (req, res) => {
  const id = req.instanceId;
  let { username } = req.body || {};
  if (!username) username = req.instance.ttUsername;
  username = (username || '').replace(/^@/, '').trim();
  if (!username) return res.json({ success: false, error: 'No username' });

  disconnectInstance(id);

  let WebcastPushConnection;
  try { ({ WebcastPushConnection } = require('tiktok-live-connector')); }
  catch (_) { return res.json({ success: false, error: 'Run npm install' }); }

  const conn = new WebcastPushConnection(username);
  try { await conn.connect(); }
  catch (e) {
    broadcastToInstance(id, { type: 'status', status: 'disconnected', isLive: false, username });
    return res.json({ success: false, error: e.message || 'Not live?' });
  }

  tiktokConns.set(id, conn);

  // isLive starts false — client flips to true when real events (gift/chat/follow) arrive
  broadcastToInstance(id, { type: 'status', status: 'connected', isLive: false, username });
  res.json({ success: true });

  const fwd = (type, data) => broadcastToInstance(id, { type, ...data });
  conn.on('gift', d => {
    if (d.giftType === 2 && !d.repeatEnd) return;
    fwd('gift', { username: d.nickname || 'Viewer', giftName: d.giftName || 'Gift',
      diamonds: (d.diamondCount || 0) * (d.repeatCount || 1) });
  });
  conn.on('chat',   d => fwd('chat',   { username: d.nickname || 'Viewer', comment: d.comment || '' }));
  conn.on('follow', d => fwd('follow', { username: d.nickname || 'Viewer' }));
  conn.on('disconnected', () => {
    tiktokConns.delete(id);
    broadcastToInstance(id, { type: 'status', status: 'disconnected', isLive: false });
  });
});

app.post('/api/disconnect', requireInstance, (req, res) => {
  disconnectInstance(req.instanceId);
  res.json({ success: true });
});

/* ── WebSocket rooms ───────────────────────────────────────── */
const wsRooms = new Map();
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const s   = sessions.get(url.searchParams.get('token'));
  if (!s) { ws.close(4001, 'Unauthorized'); return; }
  const id = s.instanceId;
  if (!wsRooms.has(id)) wsRooms.set(id, new Set());
  wsRooms.get(id).add(ws);
  ws.send(JSON.stringify({
    type: 'status',
    status: tiktokConns.has(id) ? 'connected' : 'disconnected',
    isLive: false,
    username: (store.instances[id] || {}).ttUsername || '',
  }));
  ws.on('close', () => wsRooms.get(id)?.delete(ws));
  ws.on('error', () => wsRooms.get(id)?.delete(ws));
});

function broadcastToInstance(id, data) {
  const room = wsRooms.get(id);
  if (!room) return;
  const msg = JSON.stringify({ ...data, msgId: `${Date.now()}-${Math.random()}` });
  for (const c of room) if (c.readyState === WebSocket.OPEN) c.send(msg);
}

const PORT = process.env.PORT || 7736;
server.listen(PORT, () => {
  console.log(`\n🎮  Merge Balls — http://localhost:${PORT}\n`);
});
