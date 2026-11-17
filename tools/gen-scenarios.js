'use strict';
// 預先生成劇本庫：趁 AI 有空時一次產生多個劇本與開場訊息，寫入 data/scenarios.json。
// 之後開局直接抽用，不需要呼叫 AI。
// 用法：AI_PROVIDERS=gemini GEMINI_API_KEY=... node tools/gen-scenarios.js [每個種子幾個=3]
const fs = require('fs');
const path = require('path');
const { AI } = require('../src/ai');
const story = require('../src/story');

// 用法：node tools/gen-scenarios.js [每個種子幾個=3] [地區 tw|hk]
const PER_SEED = Number(process.argv[2]) || 3;
const LOCALE = process.argv[3] || 'tw';
const OUT = path.join(__dirname, '..', 'data', LOCALE === 'tw' ? 'scenarios.json' : `scenarios-${LOCALE}.json`);
const SEEDS = story.pack(LOCALE).SEEDS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ai = new AI();
  if (!ai.enabled) return console.log('請先設定 AI_PROVIDERS 與金鑰');
  let lib = [];
  try { lib = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* 第一次執行 */ }
  const hasBeats = (x) => Array.isArray(x.beats) && x.beats.length >= 6;
  const titles = new Set(lib.filter(hasBeats).map((x) => x.title)); // 只避開已有故事線的劇名
  const good = (seed) => lib.filter((x) => x.seed === seed && hasBeats(x)).length;

  for (let round = 0; round < PER_SEED; round++) {
    for (const seed of SEEDS) {
      if (good(seed) > round) continue; // 這個種子已經夠了（可中斷後續跑）
      try {
        const avoid = lib.filter((x) => x.seed === seed && hasBeats(x)).map((x) => x.title).join('、');
        const sc = await ai.scenario(avoid ? `${seed}（請寫出和這些不同的角度：${avoid}）` : seed, 30000, LOCALE);
        const ok = sc.characters.length === 3 && sc.first.botReplies.length === 3 && hasBeats(sc) && !titles.has(sc.title);
        if (!ok) { console.log('略過（不完整或重複）：', sc.title, (sc.beats || []).length); continue; }
        // 新的有故事線；同一個種子若還有沒故事線的舊劇本，汰換掉一個。
        let old = lib.findIndex((x) => x.title === sc.title && !hasBeats(x)); // 同名的舊劇本優先汰換
        if (old < 0) old = lib.findIndex((x) => x.seed === seed && !hasBeats(x));
        if (old >= 0) lib.splice(old, 1);
        lib.push({ seed, title: sc.title, premise: sc.premise, characters: sc.characters, first: sc.first, beats: sc.beats });
        titles.add(sc.title);
        fs.writeFileSync(OUT, JSON.stringify(lib, null, 1));
        console.log(`${lib.filter(hasBeats).length}/${lib.length}. 《${sc.title}》${sc.beats.map((b) => b.event).join(' → ')}`);
      } catch (e) {
        console.log('失敗：', e.message);
      }
      await sleep(2500);
    }
  }
  console.log(`完成，共 ${lib.length} 個劇本 → ${OUT}`);
})();
