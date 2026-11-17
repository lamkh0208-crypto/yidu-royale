'use strict';
// 預先生成劇本庫：趁 AI 有空時一次產生多個劇本與開場訊息，寫入 data/scenarios.json。
// 之後開局直接抽用，不需要呼叫 AI。
// 用法：AI_PROVIDERS=gemini GEMINI_API_KEY=... node tools/gen-scenarios.js [每個種子幾個=3]
const fs = require('fs');
const path = require('path');
const { AI } = require('../src/ai');
const story = require('../src/story');

const PER_SEED = Number(process.argv[2]) || 3;
const OUT = path.join(__dirname, '..', 'data', 'scenarios.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ai = new AI();
  if (!ai.enabled) return console.log('請先設定 AI_PROVIDERS 與金鑰');
  let lib = [];
  try { lib = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* 第一次執行 */ }
  const titles = new Set(lib.map((x) => x.title));
  const count = {};
  for (const x of lib) count[x.seed] = (count[x.seed] || 0) + 1;

  for (let round = 0; round < PER_SEED; round++) {
    for (const seed of story.SEEDS) {
      if ((count[seed] || 0) > round) continue; // 這個種子已經夠了（可中斷後續跑）
      try {
        const avoid = lib.filter((x) => x.seed === seed).map((x) => x.title).join('、');
        const sc = await ai.scenario(avoid ? `${seed}（請寫出和這些不同的角度：${avoid}）` : seed, 20000);
        const ok = sc.characters.length === 3 && sc.first.botReplies.length === 3 && !titles.has(sc.title);
        if (!ok) { console.log('略過（不完整或重複）：', sc.title); continue; }
        lib.push({ seed, title: sc.title, premise: sc.premise, characters: sc.characters, first: sc.first });
        titles.add(sc.title);
        count[seed] = (count[seed] || 0) + 1;
        fs.writeFileSync(OUT, JSON.stringify(lib, null, 1));
        console.log(`${lib.length}. 《${sc.title}》${sc.premise}`);
      } catch (e) {
        console.log('失敗：', e.message);
      }
      await sleep(2500);
    }
  }
  console.log(`完成，共 ${lib.length} 個劇本 → ${OUT}`);
})();
