'use strict';
// 把配音室下載的錄音（或任何 webm/m4a/ogg/wav/mp3）轉成 MP3、去掉頭尾空白、統一音量，放進 public/voice/<地區>/。
// 檔名格式：<key>-<m|f|n>-<序號>.<副檔名>，例如 rage-m-0.webm。用法：node tools/import-voice.js <資料夾> [hk]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SRC = process.argv[2];
const LOCALE = process.argv[3] || 'hk';
if (!SRC) { console.log('用法：node tools/import-voice.js <錄音資料夾> [hk]'); process.exit(1); }
const DIR = path.join(__dirname, '..', 'public', 'voice', LOCALE);
fs.mkdirSync(DIR, { recursive: true });
const indexFile = path.join(DIR, 'index.json');
let index = {};
try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch (e) { /* 新的 */ }

for (const f of fs.readdirSync(SRC)) {
  const m = /^([a-z]+)-([mfn])-(\d+)\.(webm|m4a|mp4|ogg|wav|mp3|aac)$/i.exec(f);
  if (!m) { console.log('略過（檔名不對）：', f); continue; }
  const [, key, g, i] = m;
  const out = `${key}-${g}-${i}.mp3`;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(SRC, f),
    '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=1:stop_threshold=-45dB:stop_duration=0.3,loudnorm=I=-16:TP=-1.5',
    '-ac', '1', '-ar', '24000', '-b:a', '48k', path.join(DIR, out)]);
  index[key] = index[key] || {};
  index[key][g] = index[key][g] || [];
  if (!index[key][g].includes(out)) index[key][g].push(out);
  console.log('✓', f, '→', out);
}
fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
console.log('完成：', indexFile);
