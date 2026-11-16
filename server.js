'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Room } = require('./src/game');
const { AI } = require('./src/ai');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const ai = new AI();
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 去掉容易看錯的 I、O

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

// ---------- 速率限制（單 IP） ----------
const ipState = new Map(); // ip -> {conns, creates:[ts]}
const MAX_CONNS_PER_IP = Number(process.env.MAX_CONNS_PER_IP) || 8;
function ipOf(req) {
  const xf = req.headers['x-forwarded-for'];
  return (xf ? String(xf).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}
function ipInfo(ip) {
  if (!ipState.has(ip)) ipState.set(ip, { conns: 0, creates: [] });
  return ipState.get(ip);
}

// ---------- HTTP：只提供靜態檔 ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, ai: ai.providers.map((p) => p.name), aiStats: ai.stats }));
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(buf);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, maxPayload: 2048 });

wss.on('connection', (ws, req) => {
  const ip = ipOf(req);
  const info = ipInfo(ip);
  if (info.conns >= MAX_CONNS_PER_IP) return ws.close(4029, 'too many connections');
  info.conns++;

  let room = null;
  let player = null;
  let tokens = 12; // 每秒補 6 則，上限 12
  let last = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));

  ws.on('message', (raw) => {
    const now = Date.now();
    tokens = Math.min(12, tokens + ((now - last) / 1000) * 6);
    last = now;
    if (tokens < 1) return;
    tokens--;

    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'create' || m.t === 'join') {
      if (room) return;
      let target;
      if (m.t === 'create') {
        info.creates = info.creates.filter((t) => now - t < 60000);
        if (info.creates.length >= 5) return send({ t: 'error', msg: '開房太頻繁，等一下再試' });
        info.creates.push(now);
        target = new Room(newCode(), ai);
        rooms.set(target.code, target);
      } else {
        target = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!target) return send({ t: 'error', msg: '找不到這個房間', fatal: true });
      }
      const r = target.join(ws, m.name, typeof m.token === 'string' ? m.token : '');
      if (r.error) return send({ t: 'error', msg: r.error, fatal: true });
      room = target;
      player = r.player;
      return;
    }
    if (!room || !player || player.ws !== ws) return;
    if (m.t === 'start') room.start(player, m.topic);
    else if (m.t === 'reply') room.reply(player, m.text);
    else if (m.t === 'vote') room.vote(player, String(m.rid || ''));
    else if (m.t === 'emoji') room.emoji(player, String(m.e || ''));
    else if (m.t === 'word') room.word(player, m.text);
    else if (m.t === 'gvote') room.gvote(player, String(m.pid || ''));
    else if (m.t === 'again') room.again(player);
  });

  ws.on('close', () => {
    info.conns = Math.max(0, info.conns - 1);
    if (room && player && player.ws === ws) room.leave(player);
  });
  ws.on('error', () => {});
});

// 心跳 + 清掉沒人的房間
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.connected.length && now - room.touched > 5 * 60 * 1000) {
      room.destroy();
      rooms.delete(code);
    }
  }
  for (const [ip, info] of ipState) if (!info.conns && !info.creates.some((t) => now - t < 60000)) ipState.delete(ip);
}, 25000).unref();

server.listen(PORT, () => {
  console.log(`已讀不回大逃殺 listening on :${PORT}｜AI: ${ai.providers.map((p) => p.name).join(' → ') || '未設定（純投票模式）'}`);
});
