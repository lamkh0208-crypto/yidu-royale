'use strict';
// 像素寫實風的「證據圖」與結局海報。全部用程式逐像素繪製：先以浮點數算出光影，
// 再用有序抖動（Bayer dithering）壓成有限色階，做出老遊戲那種寫實像素畫的質感。
// 沒有任何外部圖片，所以沒有版權問題，也不需要下載。
window.Pixel = (() => {
  const W = 128, H = 72;
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const mix = (a, b, t) => a + (b - a) * t;

  // 由文字產生固定的亂數序列：同一個事件每次畫出來都一樣。
  function rng(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return () => {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      return ((h >>> 0) % 100000) / 100000;
    };
  }
  function hsl(h, s, l) {
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
  }

  class Buf {
    constructor(w = W, h = H) {
      this.w = w; this.h = h;
      this.d = new Float32Array(w * h * 3);
    }
    set(x, y, c, a = 1) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = (y * this.w + x) * 3, d = this.d;
      d[i] = mix(d[i], c[0], a); d[i + 1] = mix(d[i + 1], c[1], a); d[i + 2] = mix(d[i + 2], c[2], a);
    }
    add(x, y, c, k) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = (y * this.w + x) * 3, d = this.d;
      d[i] += c[0] * k; d[i + 1] += c[1] * k; d[i + 2] += c[2] * k;
    }
    each(fn) {
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const c = fn(x, y);
        if (c) this.set(x, y, c, c[3] == null ? 1 : c[3]);
      }
    }
    rect(x, y, w, h, c, a = 1) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
    }
    ellipse(cx, cy, rx, ry, c, a = 1, soft = 0) {
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (q <= 1) this.set(x, y, c, soft ? a * clamp((1 - q) / soft) : a);
      }
    }
    ring(cx, cy, r, c, a = 1, t = 1) {
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const q = Math.hypot(x - cx, y - cy);
        if (Math.abs(q - r) <= t / 2) this.set(x, y, c, a);
      }
    }
    line(x0, y0, x1, y1, c, a = 1) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) this.set(Math.round(mix(x0, x1, i / n)), Math.round(mix(y0, y1, i / n)), c, a);
    }
    // 加法光源：讓場景有被照亮的感覺
    light(cx, cy, r, c, k) {
      for (let y = Math.max(0, cy - r | 0); y < Math.min(this.h, cy + r); y++) for (let x = Math.max(0, cx - r | 0); x < Math.min(this.w, cx + r); x++) {
        const q = 1 - Math.hypot(x - cx, y - cy) / r;
        if (q > 0) this.add(x, y, c, k * q * q);
      }
    }
    vignette(k = 0.55) {
      const d = this.d;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const q = Math.hypot((x - this.w / 2) / (this.w / 2), (y - this.h / 2) / (this.h / 2));
        const m = 1 - k * clamp(q - 0.45) * 1.6, i = (y * this.w + x) * 3;
        d[i] *= m; d[i + 1] *= m; d[i + 2] *= m;
      }
    }
    noise(rnd, k) {
      for (let i = 0; i < this.d.length; i += 3) {
        const n = (rnd() - 0.5) * k;
        this.d[i] += n; this.d[i + 1] += n; this.d[i + 2] += n;
      }
    }
    text(str, x, y, c, a = 1) {
      for (const ch of String(str).toUpperCase()) {
        const g = FONT[ch];
        if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') this.set(x + i, y + j, c, a);
        x += 4;
      }
    }
    toCanvas(levels = 7) {
      const cv = document.createElement('canvas');
      cv.width = this.w; cv.height = this.h; cv.className = 'px';
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(this.w, this.h);
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const t = (BAYER[y & 3][x & 3] + 0.5) / 16 - 0.5;
        const i = (y * this.w + x) * 3, o = (y * this.w + x) * 4;
        for (let k = 0; k < 3; k++) img.data[o + k] = clamp(Math.round(clamp(this.d[i + k]) * levels + t) / levels) * 255;
        img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return cv;
    }
  }

  // 3×5 像素字型（只收會用到的字）
  const G = (s) => s.split(',');
  const FONT = {
    0: G('111,101,101,101,111'), 1: G('010,110,010,010,111'), 2: G('111,001,111,100,111'), 3: G('111,001,111,001,111'),
    4: G('101,101,111,001,001'), 5: G('111,100,111,001,111'), 6: G('111,100,111,101,111'), 7: G('111,001,001,001,001'),
    8: G('111,101,111,101,111'), 9: G('111,101,111,001,111'), A: G('111,101,111,101,101'), C: G('111,100,100,100,111'),
    D: G('110,101,101,101,110'), E: G('111,100,111,100,111'), I: G('111,010,010,010,111'), K: G('101,101,110,101,101'),
    L: G('100,100,100,100,111'), M: G('101,111,111,101,101'), N: G('111,101,101,101,101'), O: G('111,101,101,101,111'),
    P: G('111,101,111,100,100'), R: G('110,101,110,101,101'), S: G('111,100,111,001,111'), T: G('111,010,010,010,010'),
    Y: G('101,101,010,010,010'), $: G('111,110,111,011,111'), ':': G('000,010,000,010,000'), '.': G('000,000,000,000,010'),
    ',': G('000,000,000,010,100'), '-': G('000,000,111,000,000'), '?': G('111,001,011,000,010'), '!': G('010,010,010,000,010'),
  };
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (rnd) => `0${1 + (rnd() * 4 | 0)}:${pad(rnd() * 60 | 0)}:${pad(rnd() * 60 | 0)}`;

  // 人影：頭、軀幹、雙腿；用在監視器、門縫、照片
  function figure(b, x, y, s, c, a) {
    b.ellipse(x, y + 1, 5 * s, 1.5 * s, [0, 0, 0], 0.45, 1); // 地上的影子
    b.rect(x - 2.2 * s, y - 9 * s, 1.9 * s, 9 * s, c, a);
    b.rect(x + 0.4 * s, y - 9 * s, 1.9 * s, 9 * s, c, a);
    b.ellipse(x, y - 13.5 * s, 3.4 * s, 5.4 * s, c, a);
    b.ellipse(x, y - 20.5 * s, 2.3 * s, 2.6 * s, c, a);
    b.line(x + 2.5 * s, y - 16 * s, x + 6 * s, y - 12 * s, c, a); // 伸出去的手
    b.line(x + 2.5 * s, y - 15 * s, x + 6 * s, y - 11 * s, c, a);
  }

  const SCENES = {
    // 監視器畫面：單點透視的走廊、門、人影、掃描線與時間碼
    cctv(b, rnd) {
      const cx = 64, cy = 28, hw = 22, hh = 13;
      b.each((x, y) => {
        const dx = x - cx, dy = y - cy, u = Math.abs(dx) / hw, v = Math.abs(dy) / hh;
        let l;
        if (u <= 1 && v <= 1) l = 0.36 - 0.05 * v; // 後牆
        else if (v > u) {
          const t = v; // 越靠近鏡頭越亮
          if (dy > 0) { // 地板：磁磚縫
            const row = (t * 2.6) % 1 < 0.1, col = Math.abs(((dx / t) / 7) % 1) < 0.08;
            l = 0.24 + 0.07 * (t - 1) - (row || col ? 0.07 : 0);
          } else l = 0.13 + 0.03 * (t - 1);
        } else l = 0.27 - 0.03 * Math.min(u - 1, 2) + (((y + (dx > 0 ? x : -x) * 0.3) % 9) < 1 ? -0.03 : 0); // 側牆
        return [l * 0.82, l * 1.02, l * 0.86];
      });
      b.rect(69, 20, 11, 21, [0.08, 0.11, 0.09]); // 門
      b.rect(70, 21, 9, 20, [0.15, 0.19, 0.16]);
      b.set(77, 31, [0.6, 0.7, 0.6]);
      b.rect(45, 19, 11, 22, [0.44, 0.52, 0.46]); // 冰箱或櫃子
      b.rect(45, 27, 11, 1, [0.2, 0.25, 0.21]);
      b.rect(54, 22, 1, 4, [0.2, 0.25, 0.21]);
      b.light(64, 6, 34, [0.5, 0.62, 0.52], 0.38); // 天花板的燈
      const px = 40 + rnd() * 46, py = 52 + rnd() * 12, s = 0.8 + (py - 50) / 34;
      figure(b, px + 2, py, s, [0.02, 0.03, 0.02], 0.28); // 動態殘影
      figure(b, px, py, s, [0.02, 0.03, 0.02], 0.9);
      b.vignette(0.7);
      b.noise(rnd, 0.1);
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x++) b.set(x, y, [0, 0, 0], 0.2); // 掃描線
      const band = 8 + (rnd() * 50 | 0); // 一條訊號干擾
      for (let x = 0; x < W; x++) b.add(x, band, [1, 1, 1], 0.12);
      b.text(`CAM 0${1 + (rnd() * 6 | 0)}`, 3, 3, [0.85, 1, 0.85]);
      b.ellipse(108, 5, 1.6, 1.6, [1, 0.15, 0.15]);
      b.text('REC', 112, 3, [1, 0.3, 0.3]);
      b.text(clock(rnd), 3, 64, [0.85, 1, 0.85]);
    },

    // 轉帳成功畫面
    money(b, rnd) {
      b.each((x, y) => { const l = 0.1 + 0.12 * (y / H); return [l * 0.6, l * 0.8, l * 1.5]; });
      b.light(20, 60, 50, [0.2, 0.4, 0.9], 0.18);
      b.rect(37, 9, 60, 60, [0, 0, 0], 0.35); // 卡片陰影
      b.rect(34, 5, 60, 62, [0.95, 0.96, 0.98]);
      b.rect(34, 5, 60, 7, [0.16, 0.3, 0.62]);
      b.text('PAY', 37, 6, [1, 1, 1]);
      b.ellipse(64, 23, 8, 8, [0.16, 0.7, 0.4]);
      b.ellipse(62, 21, 5, 4, [0.4, 0.86, 0.6], 0.5, 1); // 圓形上的高光
      b.line(60, 23, 63, 26, [1, 1, 1]); b.line(63, 26, 69, 19, [1, 1, 1]);
      b.line(60, 24, 63, 27, [1, 1, 1]); b.line(63, 27, 69, 20, [1, 1, 1]);
      const amt = `NT$ ${1 + (rnd() * 9 | 0)},${rnd() < 0.5 ? '000' : '500'}`;
      b.text(amt, 64 - amt.length * 2, 35, [0.1, 0.12, 0.2]);
      for (let i = 0; i < 4; i++) {
        b.rect(40, 45 + i * 5, 14 + (rnd() * 8 | 0), 2, [0.72, 0.75, 0.8]);
        b.rect(70 + (rnd() * 6 | 0), 45 + i * 5, 16, 2, [0.5, 0.54, 0.62]);
      }
      const hi = 44 + (rnd() * 3 | 0) * 5; // 被圈起來的可疑項目
      for (let x = 38; x < 92; x++) { b.set(x, hi - 1, [0.95, 0.2, 0.2]); b.set(x, hi + 3, [0.95, 0.2, 0.2]); }
      for (let y = hi - 1; y < hi + 4; y++) { b.set(38, y, [0.95, 0.2, 0.2]); b.set(91, y, [0.95, 0.2, 0.2]); }
      b.text('?', 96, hi - 1, [1, 0.3, 0.3]);
      b.vignette(0.4);
      b.noise(rnd, 0.03);
    },

    // 被截圖的對話
    phone(b, rnd) {
      b.each((x, y) => { const g = Math.sin(x * 0.7 + y * 0.2) * 0.015; return [0.16 + g, 0.12 + g, 0.1 + g]; }); // 木頭桌面
      b.light(100, 10, 60, [1, 0.8, 0.5], 0.16);
      b.rect(43, 5, 46, 66, [0, 0, 0], 0.4);
      b.rect(40, 2, 46, 68, [0.07, 0.08, 0.1]); // 手機機身
      b.rect(42, 6, 42, 60, [0.9, 0.92, 0.95]);
      b.rect(42, 6, 42, 6, [0.2, 0.24, 0.3]);
      b.ellipse(46, 9, 1.6, 1.6, [0.6, 0.8, 0.6]);
      b.rect(50, 8, 14, 2, [0.75, 0.8, 0.85]);
      let y = 15;
      const mark = 1 + (rnd() * 3 | 0);
      for (let i = 0; i < 6 && y < 60; i++) {
        const mine = rnd() < 0.4, w = 12 + (rnd() * 18 | 0), h = rnd() < 0.3 ? 9 : 6;
        const x = mine ? 82 - w : 44;
        b.rect(x, y, w, h, mine ? [0.36, 0.78, 0.45] : [0.78, 0.8, 0.84]);
        for (let r = 0; r < (h > 6 ? 2 : 1); r++) b.rect(x + 2, y + 2 + r * 3, w - 4 - (rnd() * 4 | 0), 1, mine ? [0.14, 0.4, 0.2] : [0.4, 0.42, 0.48]);
        if (i === mark) { // 紅筆圈起來的那句
          for (let t = 0; t < 40; t++) {
            const a = (t / 40) * Math.PI * 2;
            b.set(x + w / 2 + Math.cos(a) * (w / 2 + 2), y + h / 2 + Math.sin(a) * (h / 2 + 2), [0.95, 0.15, 0.15]);
          }
        }
        y += h + 2;
      }
      b.light(52, 12, 22, [1, 1, 1], 0.1); // 螢幕反光
      b.vignette(0.5);
      b.noise(rnd, 0.035);
    },

    // 桌上的文件：名單、報表
    doc(b, rnd) {
      b.each((x, y) => { const g = Math.sin(y * 1.3 + Math.sin(x * 0.11) * 3) * 0.03; return [0.3 + g, 0.19 + g * 0.7, 0.11 + g * 0.5]; });
      b.light(30, 0, 80, [1, 0.85, 0.6], 0.3);
      const ang = -0.1 + rnd() * 0.2, ca = Math.cos(ang), sa = Math.sin(ang);
      b.each((x, y) => {
        const sx = x - 3, sy = y - 3;
        const rx = (sx - 64) * ca + (sy - 37) * sa, ry = -(sx - 64) * sa + (sy - 37) * ca;
        return Math.abs(rx) < 25 && Math.abs(ry) < 30 ? [0, 0, 0, 0.35] : null; // 紙的陰影
      });
      const rows = Array.from({ length: 9 }, () => 16 + (rnd() * 26 | 0));
      const hot = 2 + (rnd() * 5 | 0);
      b.each((x, y) => {
        const rx = (x - 64) * ca + (y - 37) * sa, ry = -(x - 64) * sa + (y - 37) * ca;
        if (Math.abs(rx) >= 25 || Math.abs(ry) >= 30) return null;
        const px = rx + 25, py = ry + 30;
        let c = [0.94 - py * 0.002, 0.93 - py * 0.002, 0.88 - py * 0.002];
        if (py > 4 && py < 9 && px > 5 && px < 34) c = [0.2, 0.22, 0.3]; // 標題
        const r = Math.floor((py - 13) / 5);
        if (py > 13 && r < 9 && (py - 13) % 5 < 2 && px > 5 && px < 5 + rows[r]) c = r === hot ? [0.85, 0.2, 0.2] : [0.45, 0.47, 0.52];
        if (r === hot && py > 13 && px > 3 && px < 47 && (py - 13) % 5 < 4) c = [mix(c[0], 1, 0.5), mix(c[1], 0.9, 0.5), mix(c[2], 0.3, 0.5)]; // 螢光筆
        return c;
      });
      b.ring(80, 55, 6, [0.82, 0.14, 0.14], 0.85, 1.6); // 紅色印章
      b.rect(77, 54, 7, 1, [0.82, 0.14, 0.14], 0.85); b.rect(80, 51, 1, 7, [0.82, 0.14, 0.14], 0.85);
      b.ring(42, 10, 3, [0.7, 0.72, 0.76], 1, 1.2); // 迴紋針
      b.vignette(0.55);
      b.noise(rnd, 0.035);
    },

    // 一張模糊的拍立得
    photo(b, rnd) {
      b.each((x, y) => { const g = Math.sin(x * 0.5 + y * 0.9) * 0.012; return [0.13 + g, 0.14 + g, 0.17 + g]; });
      b.rect(34, 6, 66, 64, [0, 0, 0], 0.4);
      b.rect(31, 3, 66, 64, [0.93, 0.92, 0.88]);
      const lx = 44 + rnd() * 40, fx = 44 + rnd() * 40;
      for (let y = 7; y < 51; y++) for (let x = 35; x < 93; x++) {
        const t = (y - 7) / 44;
        b.set(x, y, [0.05 + 0.05 * t, 0.07 + 0.09 * t, 0.14 + 0.1 * t]);
      }
      for (let y = 7; y < 51; y++) for (let x = 35; x < 93; x++) { // 暖色的光
        const q = 1 - Math.hypot(x - lx, (y - 20) * 1.3) / 30;
        if (q > 0) b.add(x, y, [1, 0.75, 0.35], 0.75 * q * q);
      }
      for (let k = -4; k <= 4; k++) { // 手震：把人影拖成一條
        const a = 0.2 - Math.abs(k) * 0.03;
        b.ellipse(fx + k * 1.5, 22, 3, 3.3, [0.01, 0.01, 0.02], a);
        b.ellipse(fx + k * 1.5, 34, 5, 9, [0.01, 0.01, 0.02], a);
        b.rect(fx + k * 1.5 - 4, 42, 3.5, 9, [0.01, 0.01, 0.02], a);
        b.rect(fx + k * 1.5 + 1, 42, 3.5, 9, [0.01, 0.01, 0.02], a);
      }
      for (let y = 51; y < 67; y++) for (let x = 31; x < 97; x++) b.set(x, y, [0.93, 0.92, 0.88]);
      for (let i = 0; i < 3; i++) b.rect(40 + i * 17, 57 + (rnd() * 2 | 0), 9 + (rnd() * 6 | 0), 1, [0.25, 0.28, 0.45]); // 手寫字
      b.text(clock(rnd).slice(0, 5), 74, 45, [1, 0.6, 0.2]);
      b.vignette(0.45);
      b.noise(rnd, 0.06);
    },

    // 錄音檔
    audio(b, rnd) {
      b.each((x, y) => { const l = 0.07 + 0.06 * (1 - y / H); return [l, l * 1.05, l * 1.4]; });
      b.rect(10, 16, 108, 40, [0.13, 0.15, 0.2]);
      b.rect(10, 16, 108, 1, [0.3, 0.34, 0.44]);
      b.ellipse(24, 36, 9, 9, [0.95, 0.62, 0.12]);
      b.ellipse(22, 33, 5, 4, [1, 0.8, 0.4], 0.5, 1);
      for (let i = 0; i < 7; i++) b.rect(21 + i, 31 + i * 0.7, 1, 11 - i * 1.5, [0.1, 0.1, 0.12]); // 播放鍵
      const played = 0.3 + rnd() * 0.4;
      for (let i = 0; i < 38; i++) {
        const env = Math.sin((i / 38) * Math.PI) * 0.6 + 0.4;
        const h = Math.max(1, Math.round((rnd() * 0.85 + 0.15) * env * 14));
        const c = i / 38 < played ? [0.98, 0.66, 0.15] : [0.3, 0.75, 0.9];
        b.rect(39 + i * 2, 36 - h, 1, h * 2, c);
      }
      b.rect(39 + played * 76, 20, 1, 32, [1, 1, 1], 0.8);
      b.text(`00:${pad(8 + rnd() * 50 | 0)}`, 96, 48, [0.75, 0.8, 0.9]);
      b.ellipse(14, 9, 2, 2, [1, 0.2, 0.2]);
      b.text('REC', 19, 7, [1, 0.35, 0.35]);
      b.light(24, 36, 34, [1, 0.6, 0.1], 0.2);
      b.vignette(0.5);
      b.noise(rnd, 0.03);
    },

    // 門縫透出的光，有人站在門口
    door(b, rnd) {
      const dx = 46 + (rnd() * 20 | 0);
      b.each((x, y) => {
        if (y < 50) { const l = 0.07 + 0.02 * Math.sin(x * 0.3); return [l, l * 1.1, l * 1.7]; } // 牆
        const l = 0.05 + 0.03 * ((y - 50) / 22) - ((x + y * 2) % 14 < 1 ? 0.02 : 0); // 地板
        return [l * 1.2, l, l * 0.9];
      });
      b.rect(dx - 2, 8, 30, 43, [0.03, 0.03, 0.05]); // 門框
      for (let y = 10; y < 50; y++) for (let x = dx; x < dx + 14; x++) { // 門內的暖光
        const t = (x - dx) / 14;
        b.set(x, y, [1 - 0.25 * t, 0.82 - 0.3 * t, 0.42 - 0.2 * t]);
      }
      b.rect(dx + 14, 10, 12, 40, [0.16, 0.11, 0.08]); // 半開的門板
      b.rect(dx + 14, 10, 1, 40, [0.3, 0.2, 0.12]);
      b.set(dx + 23, 31, [0.9, 0.8, 0.4]);
      b.each((x, y) => { // 灑在地上的光
        if (y < 50) return null;
        const t = (y - 50) / 22, l = dx - t * 22, r = dx + 14 + t * 30;
        return x > l && x < r ? [1, 0.75, 0.35, 0.5 * (1 - t * 0.6)] : null;
      });
      figure(b, dx + 7, 50, 1.25, [0.02, 0.02, 0.03], 0.96);
      b.light(dx + 7, 30, 46, [1, 0.7, 0.3], 0.22);
      b.vignette(0.65);
      b.noise(rnd, 0.045);
    },

    // 警示燈：有人翻臉、下最後通牒
    siren(b, rnd) {
      const blue = rnd() < 0.35;
      const col = blue ? [0.2, 0.45, 1] : [1, 0.15, 0.12];
      b.each((x, y) => {
        const dx = x - 64, dy = y - 44, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
        const ray = Math.cos(a * 6 + 0.6) > 0.25 ? 1 : 0.35; // 旋轉燈的光束
        const k = clamp(1 - r / 82) * ray;
        return [0.04 + col[0] * k * 0.8, 0.04 + col[1] * k * 0.8, 0.07 + col[2] * k * 0.8];
      });
      b.rect(50, 58, 28, 8, [0.12, 0.12, 0.15]); // 底座
      b.rect(52, 56, 24, 3, [0.25, 0.25, 0.3]);
      b.ellipse(64, 46, 11, 12, col); // 燈罩
      b.rect(53, 46, 22, 11, col);
      b.ellipse(60, 41, 4, 5, [1, 1, 1], 0.55, 1);
      b.light(64, 44, 26, [1, 0.9, 0.8], 0.5);
      b.text('!!', 108, 6, [1, 1, 1]); b.text('!!', 14, 6, [1, 1, 1]);
      b.vignette(0.5);
      b.noise(rnd, 0.05);
    },

    // 打開的冰箱，東西不見了
    missing(b, rnd) {
      b.each((x, y) => { const l = y < 56 ? 0.08 : 0.06 + ((x + y) % 12 < 1 ? -0.02 : 0); return [l, l * 1.1, l * 1.5]; });
      b.rect(34, 6, 44, 62, [0.55, 0.6, 0.66]); // 冰箱外殼
      for (let y = 9; y < 65; y++) for (let x = 37; x < 75; x++) { // 內部的冷光
        const t = (y - 9) / 56;
        b.set(x, y, [0.8 - 0.25 * t, 0.92 - 0.2 * t, 1 - 0.12 * t]);
      }
      for (const sy of [24, 38, 52]) b.rect(37, sy, 38, 1, [0.5, 0.62, 0.72]);
      const empty = (rnd() * 3 | 0), shelves = [23, 37, 51];
      shelves.forEach((sy, i) => {
        if (i === empty) { // 被拿走的東西只剩虛線輪廓
          for (let t = 0; t < 34; t++) if (t % 2 === 0) {
            const a = (t / 34) * Math.PI * 2;
            b.set(56 + Math.cos(a) * 7, sy - 5 + Math.sin(a) * 4.5, [0.9, 0.2, 0.2]);
          }
          b.text('?', 55, sy - 8, [0.9, 0.2, 0.2]);
          return;
        }
        let x = 39;
        for (let k = 0; k < 4; k++) {
          const w = 4 + (rnd() * 5 | 0), h = 5 + (rnd() * 7 | 0), c = hsl(rnd() * 360, 0.6, 0.5);
          b.rect(x, sy - h, w, h, c);
          b.rect(x, sy - h, 1, h, [1, 1, 1], 0.3);
          b.rect(x, sy - h, w, 2, [0.95, 0.95, 0.95], 0.6);
          x += w + 2 + (rnd() * 3 | 0);
        }
      });
      b.rect(78, 6, 20, 62, [0.4, 0.44, 0.5]); // 打開的冰箱門
      b.rect(78, 6, 2, 62, [0.66, 0.7, 0.76]);
      b.rect(94, 28, 2, 12, [0.2, 0.22, 0.26]);
      b.light(56, 40, 70, [0.6, 0.85, 1], 0.26);
      b.vignette(0.6);
      b.noise(rnd, 0.035);
    },
  };

  // 結局海報：舞台布幕、三盞聚光燈、三位角色的半身像
  function poster(names) {
    const b = new Buf(W, 60), rnd = rng(names.join('|'));
    b.each((x, y) => {
      if (y > 46) { const l = 0.16 + 0.05 * ((y - 46) / 14) - (x % 16 < 1 ? 0.04 : 0); return [l * 1.5, l, l * 0.6]; } // 木地板
      const edge = Math.min(x, W - 1 - x);
      if (edge < 20 || y < 7) { // 布幕的皺褶
        const fold = 0.5 + 0.5 * Math.sin(x * 0.9 + (y < 7 ? 0 : Math.sin(y * 0.15)));
        const l = 0.2 + 0.36 * fold;
        return [l * 1.2, l * 0.14, l * 0.2];
      }
      return [0.045, 0.04, 0.08];
    });
    const xs = [38, 64, 90];
    xs.forEach((cx) => { // 聚光燈的光錐
      b.each((x, y) => {
        if (y < 6 || y > 48) return null;
        const half = 2 + (y - 6) * 0.34;
        const d = Math.abs(x - cx);
        return d < half ? [1, 0.95, 0.75, 0.2 * (1 - d / half)] : null;
      });
      b.ellipse(cx, 49, 14, 3, [1, 0.92, 0.65], 0.4, 1);
    });
    xs.forEach((cx, i) => {
      const hue = [...(names[i] || String(i))].reduce((a, ch) => (a * 31 + ch.codePointAt(0)) % 360, 7);
      const skin = [[0.96, 0.8, 0.66], [0.88, 0.7, 0.54], [0.78, 0.58, 0.44]][rnd() * 3 | 0];
      const shirt = hsl(hue, 0.55, 0.42), hair = [[0.1, 0.08, 0.08], [0.24, 0.15, 0.09], [0.36, 0.25, 0.14], [0.5, 0.5, 0.52]][rnd() * 4 | 0]; // 黑、深棕、棕、灰白
      b.ellipse(cx, 49, 11, 9, shirt); // 肩膀
      b.ellipse(cx - 4, 45, 5, 4, [1, 1, 1], 0.14, 1);
      b.rect(cx - 2, 36, 4, 6, [skin[0] * 0.8, skin[1] * 0.8, skin[2] * 0.8]); // 脖子
      b.ellipse(cx, 29, 6.2, 7.4, skin);
      b.ellipse(cx + 3, 30, 3.6, 6, [skin[0] * 0.75, skin[1] * 0.72, skin[2] * 0.72], 0.5, 1); // 臉的暗面
      b.ellipse(cx, 23.5, 6.8, 4.6, hair); // 頭髮
      if (rnd() < 0.5) { b.rect(cx - 7, 24, 2, 9, hair); b.rect(cx + 5, 24, 2, 9, hair); }
      b.rect(cx - 3.5, 28, 2, 1, [0.08, 0.06, 0.06]); b.rect(cx + 1.5, 28, 2, 1, [0.08, 0.06, 0.06]); // 眼睛
      b.rect(cx - 4, 26, 3, 1, hair, 0.8); b.rect(cx + 1, 26, 3, 1, hair, 0.8); // 眉毛
      b.rect(cx - 1.5, 33, 3, 1, [0.55, 0.22, 0.2]); // 嘴
      b.set(cx, 31, [skin[0] * 0.7, skin[1] * 0.65, skin[2] * 0.62]); // 鼻子
    });
    b.rect(0, 46, W, 1, [0, 0, 0], 0.4);
    b.vignette(0.55);
    b.noise(rnd, 0.035);
    return b.toCanvas(8);
  }

  return {
    evidence(kind, seed) {
      const b = new Buf(), rnd = rng(`${kind}|${seed}`);
      (SCENES[kind] || SCENES.siren)(b, rnd);
      return b.toCanvas();
    },
    poster,
    kinds: Object.keys(SCENES),
  };
})();
