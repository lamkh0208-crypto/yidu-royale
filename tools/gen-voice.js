'use strict';
// 產生固定配音包：每句用男聲、女聲各產生一次，聽寫比對通過才收錄，轉成 MP3。
// 用法：GEMINI_API_KEY=... node tools/gen-voice.js [hk]   （需要 ffmpeg）
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Voice } = require('../src/voice');
const LINES = require('../src/voice-lines');

const LOCALE = process.argv[2] || 'hk';
const DIR = path.join(__dirname, '..', 'public', 'voice', LOCALE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const v = new Voice({ ...process.env, VOICE_LOCALES: LOCALE, VOICE_RPM: '1000' });
  fs.mkdirSync(DIR, { recursive: true });
  const indexFile = path.join(DIR, 'index.json');
  let index = {};
  try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch (e) { /* 第一次 */ }
  // 男聲、女聲各用一個固定的「代表角色名」，讓 voiceFor 選到對應性別
  const speakers = { m: '老細Raymond', f: 'May姐', n: '旁白阿Ken' };
  for (const [key, def] of Object.entries(LINES[LOCALE])) {
    index[key] = index[key] || {};
    const genders = def.narrator ? ['n'] : ['m', 'f'];
    for (const g of genders) {
      index[key][g] = index[key][g] || [];
      for (const [i, text] of def.lines.entries()) {
        const file = `${key}-${g}-${i}.mp3`;
        if (index[key][g].includes(file)) continue;
        let ok = false;
        for (let attempt = 0; attempt < 4 && !ok; attempt++) {
          const res = await v.speak(text, LOCALE, speakers[g], def.mood, 30000);
          if (res) {
            const wavPath = path.join(DIR, '_tmp.wav');
            fs.writeFileSync(wavPath, v.get(res.id));
            execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wavPath, '-ac', '1', '-b:a', '40k', path.join(DIR, file)]);
            fs.unlinkSync(wavPath);
            index[key][g].push(file);
            fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
            console.log(`✓ ${file}「${text}」聽寫「${res.heard}」相似度 ${res.score.toFixed(2)}`);
            ok = true;
          } else {
            console.log(`✗ ${file}「${text}」第 ${attempt + 1} 次沒通過：聽寫「${v.last && v.last.text === text ? v.last.heard : '-'}」${v.lastError || ''}`);
            v.lastError = '';
            const wait = Math.max(4000, v.cooldown - Date.now() + 1000); // 被限流就等冷卻結束
            if (wait > 4000) console.log(`  等 ${Math.round(wait / 1000)} 秒（限流）`);
            await sleep(wait);
            attempt -= wait > 4000 ? 1 : 0; // 限流不算失敗次數
          }
        }
        await sleep(1500);
      }
    }
  }
  console.log('完成', JSON.stringify(v.stats));
})();
