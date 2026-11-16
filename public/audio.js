'use strict';
// 背景音樂與音效：全部用 Web Audio 即時合成，不使用任何外部音檔（沒有版權問題、也不用下載）。
// 模式：0 = 全開、1 = 只有音效、2 = 靜音。瀏覽器規定要在使用者點擊後才能出聲，所以由第一次點擊啟動。
window.Sound = (() => {
  let ctx = null, master, musicBus, sfxBus;
  let mode = 0;
  try { mode = Number(localStorage.getItem('yd_sound')) || 0; } catch (e) { /* ignore */ }
  let mood = 'off'; // off | lobby | idle | tense | panic
  let step = 0, nextTime = 0, timer = null;

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
    musicBus.gain.setTargetAtTime(mode === 0 ? 0.5 : 0, t, 0.15);
    sfxBus.gain.setTargetAtTime(mode === 2 ? 0 : 0.9, t, 0.05);
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
  const BPM = { lobby: 76, idle: 88, tense: 104, panic: 132 };
  const ARP = [0, 2, 1, 3, 2, 1, 3, 2];

  function schedule() {
    if (!ctx || mood === 'off' || mode !== 0) return;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.25) {
      playStep(step, nextTime);
      nextTime += 60 / BPM[mood] / 2; // 八分音符
      step = (step + 1) % 32;
    }
  }

  function playStep(s, t) {
    const chord = CHORDS[Math.floor(s / 8)];
    const i = s % 8;
    const busy = mood === 'tense' || mood === 'panic';
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
    start: (t) => [330, 440, 660].forEach((f, i) => tone(sfxBus, f, 0.14, 'square', 0.12, t + i * 0.09)),
  };

  return {
    init,
    play(name) {
      if (!ctx || mode === 2 || !SFX[name] || ctx.state !== 'running') return;
      SFX[name](ctx.currentTime + 0.01);
    },
    setMood(m) {
      if (m === mood) return;
      mood = m;
    },
    cycle() {
      mode = (mode + 1) % 3;
      try { localStorage.setItem('yd_sound', String(mode)); } catch (e) { /* ignore */ }
      init();
      applyMode();
      return mode;
    },
    get mode() { return mode; },
  };
})();
