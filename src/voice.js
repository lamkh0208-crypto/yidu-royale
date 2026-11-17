'use strict';
// 角色配音：用 Gemini 語音模型產生粵語語音，再用另一個模型聽寫一次，和原文比對，
// 只有聽寫結果夠接近原文的才拿來播。實測語音模型偶爾會讀錯字或把指示也唸出來，所以一定要驗。
// 驗不過、逾時、額度用完：一律不配音，前端改用「碎碎念」，遊戲不受影響。

const crypto = require('crypto');

// 實測：2.5 版常常拒絕短句（finishReason OTHER），所以只用 3.x 的語音模型。
const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-3.8-flash-lite-tts'];
const CHECK_MODELS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite'];
const MALE = ['Charon', 'Orus', 'Fenrir', 'Puck', 'Algenib'];
const FEMALE = ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Despina'];
const FEMALE_HINT = /姐|姑|媽|嫲|婆|太|姨|嬸|妹|女|娘|后|小姐|May|Mandy|Karen|Mimi|Wing|Yan|Kitty|Amy|Ivy|Cindy|Jenny|Lily|Emily|Grace|Bella|Vicky|Fiona|Coco|Jessica/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 100003, 7);

// 依角色名字選聲音：女性稱呼用女聲，其他用男聲；同一個角色每次都是同一把聲。
function voiceFor(name) {
  const set = FEMALE_HINT.test(name) ? FEMALE : MALE;
  return set[hash(name) % set.length];
}

// 實測：在句子前面加任何風格指示（英文或中文），模型常常會把指示也唸出來，或乾脆不產生聲音。
// 所以只送台詞本身；粵語字（冇、咗、喺…）足以讓模型用廣東話唸。情緒靠台詞的標點和每個角色固定的聲音。
function prompt(text) {
  return String(text);
}

// 比對用：去掉標點與語氣詞的差異，算最長共同子序列佔原文的比例。
// 聽寫常把同一個字寫成不同寫法（冇／無、咗／左…），比對前先統一
const SAME = { 無: '冇', 左: '咗', 系: '係', 既: '嘅', 野: '嘢', 甘: '咁', 果: '嗰', 依: '呢', 而: '而', 唔: '唔', 噉: '咁', 哂: '晒' };
function norm(s) {
  return [...String(s)].map((c) => SAME[c] || c).join('')
    .replace(/[\s「」『』（）()，。！？!?,.、…~～：:；;"'“”‘’\-—]/g, '')
    .replace(/[呀啊吖啦喎囉嘛咩喇呢吓]/g, '');
}
function similarity(a, b) {
  const x = [...norm(a)], y = [...norm(b)];
  if (!x.length) return 0;
  const dp = Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let prev = 0;
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j];
      dp[j] = x[i - 1] === y[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[y.length] / x.length;
}

function wavFrom(part) {
  const buf = Buffer.from(part.inlineData.data, 'base64');
  if (buf.slice(0, 4).toString() === 'RIFF') return buf;
  const rate = Number((/rate=(\d+)/.exec(part.inlineData.mimeType || '') || [])[1]) || 24000;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + buf.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(buf.length, 40);
  return Buffer.concat([h, buf]);
}
const wavSeconds = (wav) => (wav.length - 44) / (wav.readUInt32LE(28) || 48000);

// 24kHz → 16kHz，檔案小三分之一，手機網路比較快。（簡單的線性內插，語音夠用。）
function downsample(wav, to = 16000) {
  const from = wav.readUInt32LE(24);
  if (from <= to) return wav;
  const n = (wav.length - 44) / 2, m = Math.floor((n * to) / from);
  const out = Buffer.alloc(44 + m * 2);
  wav.copy(out, 0, 0, 44);
  out.writeUInt32LE(36 + m * 2, 4); out.writeUInt32LE(to, 24); out.writeUInt32LE(to * 2, 28); out.writeUInt32LE(m * 2, 40);
  for (let i = 0; i < m; i++) {
    const p = (i * from) / to, k = Math.floor(p), f = p - k;
    const a = wav.readInt16LE(44 + k * 2), b = k + 1 < n ? wav.readInt16LE(44 + (k + 1) * 2) : a;
    out.writeInt16LE(Math.round(a + (b - a) * f), 44 + i * 2);
  }
  return out;
}

class Voice {
  constructor(env = process.env) {
    this.key = env.GEMINI_API_KEY || '';
    // 預設關閉：Gemini 語音模型免費額度每個模型每天只有 10 次，撐不起即時配音。付費金鑰才建議設 VOICE_LOCALES=hk。
    this.locales = (env.VOICE_LOCALES || '').split(',').map((s) => s.trim()).filter(Boolean);
    this.rpm = Number(env.VOICE_RPM) || 6; // 全站每分鐘最多幾句配音（語音模型的免費額度很小）
    this.minScore = Number(env.VOICE_MIN_SCORE) || 0.8;
    this.recent = [];
    this.cache = new Map(); // id -> wav（最多保留 80 句）
    this.cooldown = 0;
    this.stats = { ok: 0, rejected: 0, failed: 0, skipped: 0 };
  }

  enabledFor(locale) {
    return !!this.key && this.locales.includes(locale);
  }

  async call(model, body, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.key },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`http ${r.status}`);
      return j;
    } finally {
      clearTimeout(timer);
    }
  }

  async synth(text, locale, who, mood, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (const model of TTS_MODELS) {
      const left = deadline - Date.now();
      if (left < 1500) break;
      try {
        const r = await this.call(model, {
          contents: [{ parts: [{ text: prompt(text) }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceFor(who) } } } },
        }, left);
        const part = ((r.candidates || [])[0] || {}).content?.parts?.find((p) => p.inlineData);
        if (!part) continue;
        const wav = wavFrom(part);
        // 長度檢查：明顯太長通常是把指示也唸出來了
        const secs = wavSeconds(wav), chars = norm(text).length;
        if (secs > chars * 0.42 + 2.5 || secs < chars * 0.12) continue;
        return wav;
      } catch (e) {
        if (/429/.test(e.message)) this.cooldown = Date.now() + 60000;
        this.lastError = `${model} ${e.message}`;
      }
    }
    return null;
  }

  async transcribe(wav, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (const model of CHECK_MODELS) {
      const left = deadline - Date.now();
      if (left < 1000) break;
      try {
        const r = await this.call(model, { contents: [{ parts: [
          { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
          { text: '逐字寫出這段粵語錄音的內容，用繁體中文和粵語字。只輸出聽寫結果，不要任何解釋。' },
        ] }] }, left);
        return ((r.candidates || [])[0] || {}).content?.parts?.map((p) => p.text || '').join('').trim() || '';
      } catch (e) { /* 換下一個 */ }
    }
    return null;
  }

  // 產生並驗證一句配音。成功回傳 { id, score, text }，否則 null。
  async speak(text, locale, who, mood, timeoutMs = 12000) {
    if (!this.enabledFor(locale) || !text) return null;
    const now = Date.now();
    this.recent = this.recent.filter((t) => now - t < 60000);
    if (this.recent.length >= this.rpm || now < this.cooldown) { this.stats.skipped++; return null; }
    this.recent.push(now);
    const deadline = now + timeoutMs;
    const wav = await this.synth(text, locale, who, mood, timeoutMs * 0.6);
    if (!wav) { this.stats.failed++; return null; }
    const heard = await this.transcribe(wav, deadline - Date.now());
    const score = heard == null ? 0 : similarity(text, heard);
    this.last = { text, heard, score };
    if (score < this.minScore) { this.stats.rejected++; return null; }
    const id = crypto.randomBytes(8).toString('hex');
    this.cache.set(id, downsample(wav));
    while (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value);
    this.stats.ok++;
    return { id, score, heard };
  }

  get(id) {
    return this.cache.get(id) || null;
  }
}

module.exports = { Voice, voiceFor, similarity, prompt, wavFrom, wavSeconds, norm };
