'use strict';
// 背景音樂與音效：全部用 Web Audio 即時合成，不使用任何外部音檔（沒有版權問題、也不用下載）。
// 模式：0 = 音樂＋音效＋角色「碎碎念」（預設）、1 = 音樂＋音效＋手機語音朗讀、2 = 只有音效、3 = 靜音。瀏覽器規定要在使用者點擊後才能出聲，所以由第一次點擊啟動。
window.Sound = (() => {
  let ctx = null, master, musicBus, sfxBus;
  let mode = 0;
  try { mode = Math.min(3, Number(localStorage.getItem('yd_sound')) || 0); } catch (e) { /* ignore */ }
  let mood = 'off'; // off | lobby | idle | tense | panic
  let step = 0, nextTime = 0, timer = null;
  let emo = 1; // 出題角色的情緒：0 心情好、1 普通、2 不爽、3 暴怒

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    musicBus.connect(master);
    sfxBus.connect(master);
    applyMode();
    timer = setInterval(schedule, 60);
    return true;
  }

  function applyMode() {
    if (!ctx) return;
    const t = ctx.currentTime;
    musicBus.gain.setTargetAtTime(mode <= 1 ? 0.5 : 0, t, 0.15);
    sfxBus.gain.setTargetAtTime(mode === 3 ? 0 : 0.9, t, 0.05);
  }

  // 一個音：頻率、長度、波形、音量、起始時間、滑到的頻率
  function tone(bus, f, dur, type, vol, when, slide) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, when);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(bus);
    o.start(when);
    o.stop(when + dur + 0.05);
  }
  function noise(bus, dur, vol, when, hp) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(bus);
    src.start(when);
  }

  // ---------- 背景音樂：四個小調和弦循環，依氣氛改速度與配器 ----------
  const N = (semi) => 110 * 2 ** (semi / 12); // 以 A2 為基準
  const CHORDS = [
    [0, 3, 7, 12], // Am
    [-4, 0, 3, 8], // F
    [-9, -5, 0, 3], // C（低八度根音）
    [-5, -1, 2, 7], // E
  ];
  // 心情好的時候換成大調和弦（C–G–Am–F）
  const CHORDS_CALM = [
    [3, 7, 10, 15],
    [-2, 2, 5, 10],
    [0, 3, 7, 12],
    [-4, 0, 3, 8],
  ];
  const BPM = { lobby: 76, idle: 88, tense: 104, panic: 132 };
  const ARP = [0, 2, 1, 3, 2, 1, 3, 2];

  function schedule() {
    if (!ctx || mood === 'off' || mode > 1) return;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.25) {
      playStep(step, nextTime);
      nextTime += 60 / (BPM[mood] * (mood === 'lobby' ? 1 : 0.9 + emo * 0.09)) / 2; // 八分音符；越生氣越快
      step = (step + 1) % 32;
    }
  }

  function playStep(s, t) {
    const calm = emo === 0 || mood === 'lobby';
    const chord = (calm ? CHORDS_CALM : CHORDS)[Math.floor(s / 8)];
    const i = s % 8;
    const busy = mood === 'tense' || mood === 'panic';
    const angry = mood !== 'lobby' && emo >= 2;
    // 低音
    if (i === 0 || (busy && i === 4) || (mood === 'panic' && i % 2 === 0)) tone(musicBus, N(chord[0]) / 2, 0.42, 'triangle', 0.5, t);
    // 分解和弦（大廳比較稀疏）
    if (mood !== 'lobby' || i % 2 === 0) {
      tone(musicBus, N(chord[ARP[i]]) * 2, busy ? 0.16 : 0.3, busy ? 'square' : 'sine', busy ? 0.07 : 0.16, t);
    }
    // 墊底長音
    if (i === 0) for (const n of chord.slice(1, 3)) tone(musicBus, N(n), 1.8, 'sine', 0.06, t);
    // 節奏
    if (busy && i % 2 === 1) noise(musicBus, 0.04, 0.1, t, 6000);
    if (busy && i === 4) noise(musicBus, 0.12, 0.14, t, 1800);
    if (mood === 'panic' && i % 4 === 0) tone(musicBus, 70, 0.14, 'sine', 0.5, t, 40);
    // 不爽：加上不和諧的三全音；暴怒：鋸齒低音加重拍
    if (angry && (i === 3 || i === 6)) tone(musicBus, N(chord[0] + 6) * 2, 0.12, 'sawtooth', 0.05 + emo * 0.015, t);
    if (mood !== 'lobby' && emo === 3) {
      if (i % 2 === 0) tone(musicBus, N(chord[0]) / 2, 0.2, 'sawtooth', 0.16, t);
      if (i % 4 === 0) tone(musicBus, 80, 0.16, 'sine', 0.55, t, 38);
      if (i % 4 === 2) noise(musicBus, 0.1, 0.16, t, 1500);
    }
  }

  // ---------- 音效 ----------
  const SFX = {
    msg: (t) => { tone(sfxBus, 880, 0.09, 'sine', 0.3, t); tone(sfxBus, 1175, 0.14, 'sine', 0.3, t + 0.09); },
    send: (t) => tone(sfxBus, 420, 0.13, 'sine', 0.25, t, 980),
    tick: (t) => tone(sfxBus, 1300, 0.04, 'square', 0.08, t),
    vote: (t) => { tone(sfxBus, 660, 0.07, 'triangle', 0.25, t); tone(sfxBus, 990, 0.1, 'triangle', 0.2, t + 0.06); },
    pop: (t) => tone(sfxBus, 520, 0.07, 'sine', 0.22, t, 700),
    lost: (t) => { tone(sfxBus, 190, 0.28, 'sawtooth', 0.22, t, 80); noise(sfxBus, 0.12, 0.2, t, 300); },
    out: (t) => [392, 330, 262, 196].forEach((f, i) => tone(sfxBus, f, 0.22, 'triangle', 0.28, t + i * 0.16)),
    win: (t) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(sfxBus, f, i === 4 ? 0.6 : 0.16, 'triangle', 0.3, t + i * 0.12)),
    ghost: (t) => tone(sfxBus, 300, 0.5, 'sine', 0.18, t, 900),
    emoji: (t) => tone(sfxBus, 1500, 0.05, 'sine', 0.1, t),
    rage: (t) => { tone(sfxBus, 140, 0.35, 'sawtooth', 0.25, t, 60); tone(sfxBus, 147, 0.35, 'square', 0.12, t, 64); noise(sfxBus, 0.2, 0.22, t, 500); },
    happy: (t) => [784, 988, 1175].forEach((f, i) => tone(sfxBus, f, 0.1, 'sine', 0.2, t + i * 0.07)),
    start: (t) => [330, 440, 660].forEach((f, i) => tone(sfxBus, f, 0.14, 'square', 0.12, t + i * 0.09)),
  };

  // ---------- 碎碎念 ----------
  let voiceNodes = [];
  function babble(text, seed, mood) {
    if (!ctx || ctx.state !== 'running') return;
    for (const n of voiceNodes) { try { n.stop(); } catch (e) { /* 已經停了 */ } }
    voiceNodes = [];
    const chars = Array.from(String(text).replace(/[\s「」（）()@#＊*~～…]/g, '')).slice(0, 30);
    let h = 7;
    for (const ch of String(seed)) h = (h * 31 + ch.codePointAt(0)) % 9973;
    const base = 140 + (h % 150); // 每個角色有自己的音高：140–290 Hz
    const angry = mood >= 3, happy = mood <= 1;
    const step = angry ? 0.052 : happy ? 0.068 : 0.075;
    const question = /[?？]\s*$/.test(text);
    let t = ctx.currentTime + 0.03;
    chars.forEach((ch, i) => {
      if (/[，,。.、！!？?：:；;]/.test(ch)) { t += step * 2.2; return; } // 標點停頓
      const c = ch.codePointAt(0);
      const tail = question && i >= chars.length - 3 ? 1.25 : 1; // 問句尾音上揚
      const f = base * (1 + ((c % 7) - 3) * 0.05) * tail * (angry ? 0.88 : happy ? 1.12 : 1);
      const o = ctx.createOscillator();
      o.type = angry ? 'sawtooth' : 'square';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (angry ? 0.82 : happy ? 1.1 : 0.97), t + step);
      const bp = ctx.createBiquadFilter(); // 共振峰：讓方波聽起來像不同的母音
      bp.type = 'bandpass';
      bp.frequency.value = 700 + (c % 5) * 380;
      bp.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(angry ? 0.5 : 0.36, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.92);
      o.connect(bp).connect(g).connect(sfxBus);
      o.start(t);
      o.stop(t + step + 0.02);
      voiceNodes.push(o);
      t += step;
    });
  }

  return {
    init,
    play(name) {
      if (!ctx || mode === 3 || !SFX[name] || ctx.state !== 'running') return;
      SFX[name](ctx.currentTime + 0.01);
    },
    setMood(m) {
      if (m === mood) return;
      mood = m;
    },
    setEmotion(level) {
      emo = Math.max(0, Math.min(3, level | 0));
    },
    cycle() {
      mode = (mode + 1) % 4;
      if (mode !== 1 && window.speechSynthesis) window.speechSynthesis.cancel();
      try { localStorage.setItem('yd_sound', String(mode)); } catch (e) { /* ignore */ }
      init();
      applyMode();
      return mode;
    },
    get mode() { return mode; },
    // 用瀏覽器內建的語音把角色的話唸出來：香港版用粵語，台灣版用國語。裝置沒有對應語音就安靜略過。
    // 角色說話。預設是遊戲式的「碎碎念」：每個字一個短音，音高依角色而不同、依情緒變化
    // （像動物森友會那種），不用唸出真的字，所以不會有語音唸錯、腔調怪的問題。
    // 選了「手機語音朗讀」才用裝置內建的語音合成。
    say(text, locale, who, mood) {
      if (!text || mode > 1) return;
      if (mode === 0) return babble(text, who || text, mood == null ? 2 : mood);
      const synth = window.speechSynthesis;
      if (!synth) return;
      const want = locale === 'hk' ? ['zh-HK', 'yue'] : ['zh-TW'];
      const voices = synth.getVoices();
      const voice = voices.find((v) => want.some((w) => v.lang.replace('_', '-').startsWith(w)));
      if (locale === 'hk' && voices.length && !voice) return; // 沒有粵語語音就不要用國語硬唸
      const u = new SpeechSynthesisUtterance(String(text).replace(/[「」（）()@]/g, ' '));
      u.lang = locale === 'hk' ? 'zh-HK' : 'zh-TW';
      if (voice) u.voice = voice;
      u.rate = 1.15;
      u.pitch = 0.9;
      u.volume = 1;
      synth.cancel();
      synth.speak(u);
    },
  };
})();
