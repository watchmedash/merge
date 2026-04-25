const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(express.json());

// Serve static files from 'public' folder
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Explicit root route fallback
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ── WebSocket client registry ────────────────────────────────────────────────
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  // Send current TikTok status immediately
  ws.send(JSON.stringify({ type: 'status', status: tiktokStatus, username: tiktokUsername }));

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

// ── TikTok state ─────────────────────────────────────────────────────────────
let tiktokConn     = null;
let tiktokStatus   = 'disconnected';
let tiktokUsername = '';

// ── Connect endpoint ──────────────────────────────────────────────────────────
app.post('/api/connect', async (req, res) => {
  let { username } = req.body || {};
  if (!username) return res.json({ success: false, error: 'Username required' });

  username = username.replace(/^@/, '').trim();

  // Disconnect previous session cleanly
  if (tiktokConn) {
    try { tiktokConn.disconnect(); } catch (_) {}
    tiktokConn = null;
  }

  let WebcastPushConnection;
  try {
    ({ WebcastPushConnection } = require('tiktok-live-connector'));
  } catch (e) {
    return res.json({ success: false, error: 'tiktok-live-connector not installed. Run: npm install' });
  }

  tiktokConn = new WebcastPushConnection(username);

  try {
    await tiktokConn.connect();
    tiktokStatus   = 'connected';
    tiktokUsername = username;
    broadcast({ type: 'status', status: 'connected', username });
    res.json({ success: true });
  } catch (err) {
    tiktokConn   = null;
    tiktokStatus = 'disconnected';
    return res.json({ success: false, error: err.message || 'Could not connect. Is the user live?' });
  }

  // ── Gift events ─────────────────────────────────────────────────────────────
  // giftType 1 = single (always fire)
  // giftType 2 = streak (fire only when repeatEnd === true, i.e. streak finished)
  tiktokConn.on('gift', (data) => {
    const isStreakEnd = data.giftType === 2 && data.repeatEnd === true;
    const isSingle    = data.giftType === 1;
    if (!isSingle && !isStreakEnd) return;

    const diamonds = (data.diamondCount || 0) * (data.repeatCount || 1);
    broadcast({
      type       : 'gift',
      username   : data.nickname   || data.uniqueId || 'Viewer',
      giftName   : data.giftName   || 'Gift',
      giftId     : data.giftId,
      diamonds,
      repeatCount: data.repeatCount || 1,
    });
  });

  // ── Chat events ──────────────────────────────────────────────────────────────
  tiktokConn.on('chat', (data) => {
    broadcast({
      type    : 'chat',
      username: data.nickname || data.uniqueId || 'Viewer',
      comment : data.comment  || '',
    });
  });

  // ── Like events ──────────────────────────────────────────────────────────────
  tiktokConn.on('like', (data) => {
    broadcast({
      type     : 'like',
      username : data.nickname || data.uniqueId || 'Viewer',
      likeCount: data.likeCount || 1,
      totalLikeCount: data.totalLikeCount || 0,
    });
  });

  // ── Follow events ─────────────────────────────────────────────────────────────
  tiktokConn.on('follow', (data) => {
    broadcast({
      type    : 'follow',
      username: data.nickname || data.uniqueId || 'Viewer',
    });
  });

  // ── Share events ──────────────────────────────────────────────────────────────
  tiktokConn.on('share', (data) => {
    broadcast({
      type    : 'share',
      username: data.nickname || data.uniqueId || 'Viewer',
    });
  });

  // ── Disconnection ────────────────────────────────────────────────────────────
  tiktokConn.on('disconnected', () => {
    tiktokStatus   = 'disconnected';
    tiktokUsername = '';
    broadcast({ type: 'status', status: 'disconnected' });
  });
});

// ── Disconnect endpoint ───────────────────────────────────────────────────────
app.post('/api/disconnect', (req, res) => {
  if (tiktokConn) {
    try { tiktokConn.disconnect(); } catch (_) {}
    tiktokConn = null;
  }
  tiktokStatus   = 'disconnected';
  tiktokUsername = '';
  broadcast({ type: 'status', status: 'disconnected' });
  res.json({ success: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3011;
server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  🎮  Merge Balls TikTok Live             ║');
  console.log(`║  👉  Open: http://localhost:${PORT}         ║`);
  console.log('╚══════════════════════════════════════════╝\n');
  console.log('Enter your TikTok @username in the browser to connect.\n');
});
