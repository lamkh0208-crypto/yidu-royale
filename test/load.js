'use strict';
// 壓力測試：同時開很多房間，每間 6 個機器人玩完整局，回報完成率、延遲與記憶體。
// 用法：node test/load.js [房間數=40]
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const ROOMS = Number(process.argv[2]) || 40;
const PER_ROOM = 6;
const PORT = 4190;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, AI_PROVIDERS: 'mock', T_INTRO: 200, T_ANSWER: 3000, T_VOTE: 1500, T_JUDGE: 2000, T_REVEAL: 400, T_SCENARIO: 800, MAX_CONNS_PER_IP: 100000, MAX_CREATES_PER_MIN: 100000 },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvErr = '';
  srv.stderr.on('data', (d) => (srvErr += d));
  await new Promise((r) => srv.stdout.once('data', r));

  const stat = { done: 0, msgs: 0, bytes: 0, errors: 0, lat: [] };
  const sockets = [];

  function client(room, i, code) {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      sockets.push(ws);
      let acted = '', sentAt = 0;
      ws.on('open', () => ws.send(JSON.stringify(i === 0 ? { t: 'create', name: `r${room}p0` } : { t: 'join', code, name: `r${room}p${i}` })));
      ws.on('error', () => stat.errors++);
      ws.on('message', (raw) => {
        stat.msgs++;
        stat.bytes += raw.length;
        const m = JSON.parse(raw);
        if (m.t === 'error') { stat.errors++; return; }
        if (m.t !== 'state') return;
        if (sentAt) { stat.lat.push(Date.now() - sentAt); sentAt = 0; }
        resolve(m.code);
        if (i === 0 && m.phase === 'OVER' && acted !== 'over') { acted = 'over'; stat.done++; }
        const key = m.phase + m.round;
        if (acted === key || acted === 'over') return;
        const me = m.players.find((p) => p.id === m.you.id);
        if (m.phase === 'ANSWER' && me.lives > 0) {
          acted = key;
          setTimeout(() => { sentAt = Date.now(); ws.send(JSON.stringify({ t: 'reply', text: `${m.keyword}，我是 ${i} 號，馬上處理` })); }, 200 + Math.random() * 1500);
        }
      });
    });
  }

  const t0 = Date.now();
  // 分批開房，模擬玩家陸續進來
  for (let r = 0; r < ROOMS; r++) {
    const first = client(r, 0);
    const code = await first;
    await Promise.all(Array.from({ length: PER_ROOM - 1 }, (_, k) => client(r, k + 1, code)));
    sockets[r * PER_ROOM].send(JSON.stringify({ t: 'start' }));
    if (r % 10 === 9) await sleep(100);
  }
  const opened = Date.now() - t0;
  let peak = 0;
  while (stat.done < ROOMS && Date.now() - t0 < 180000) {
    await sleep(500);
    try {
      const h = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/healthz`, (r) => {
          let d = '';
          r.on('data', (c) => (d += c));
          r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      peak = Math.max(peak, h.rssMB || 0);
    } catch (e) { stat.errors++; }
  }
  const lat = stat.lat.sort((a, b) => a - b);
  const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] || 0;
  console.log(`房間 ${ROOMS} 間、連線 ${ROOMS * PER_ROOM} 條；開房耗時 ${opened}ms`);
  console.log(`完成 ${stat.done}/${ROOMS} 局，耗時 ${Math.round((Date.now() - t0) / 1000)} 秒；錯誤 ${stat.errors}`);
  console.log(`送出回覆到收到更新的延遲：中位數 ${pct(0.5)}ms、95% ${pct(0.95)}ms、最大 ${lat[lat.length - 1] || 0}ms`);
  console.log(`伺服器記憶體峰值 ${peak}MB；共推送 ${stat.msgs} 則、${(stat.bytes / 1e6).toFixed(1)}MB`);
  if (srvErr.trim()) console.log('伺服器錯誤輸出：', srvErr.slice(0, 500));
  for (const ws of sockets) ws.close();
  srv.kill();
  process.exit(stat.done === ROOMS && !stat.errors ? 0 : 1);
})();
