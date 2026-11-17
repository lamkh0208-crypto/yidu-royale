'use strict';
// 配音室：用手機麥克風錄固定對白，下載成檔案。錄音只存在這個分頁的記憶體裡，不會上傳到任何地方。
(() => {
  const $ = (id) => document.getElementById(id);
  const MOOD = ['開心', '輕鬆', '無奈', '串／不耐煩', '好嬲'];
  const recs = {}; // 檔名主幹 -> { blob, url, ext }
  let lines = {};
  let gender = 'm';
  let stream = null, rec = null, recKey = '', chunks = [], timer = null;

  function extOf(type) {
    if (/mp4|m4a|aac/.test(type)) return 'm4a';
    if (/ogg/.test(type)) return 'ogg';
    return 'webm';
  }

  async function startRec(key, btn) {
    try {
      stream = stream || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      $('micErr').textContent = '用唔到麥克風：請喺瀏覽器設定允許麥克風，再重新整理。';
      return;
    }
    chunks = [];
    recKey = key;
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type });
      if (recs[recKey]) URL.revokeObjectURL(recs[recKey].url);
      recs[recKey] = { blob, url: URL.createObjectURL(blob), ext: extOf(type) };
      render();
    };
    rec.start();
    btn.textContent = '⏹ 停';
    btn.classList.add('recording');
    timer = setTimeout(stopRec, 8000); // 每句最多 8 秒
  }
  function stopRec() {
    clearTimeout(timer);
    if (rec && rec.state === 'recording') rec.stop();
    rec = null;
  }

  function render() {
    const box = $('lines');
    box.replaceChildren();
    let total = 0, done = 0;
    for (const [key, def] of Object.entries(lines)) {
      const gs = def.narrator ? ['n'] : ['m', 'f'];
      if (!gs.includes(gender)) continue;
      def.lines.forEach((text, i) => {
        const id = `${key}-${gender}-${i}`;
        total++;
        if (recs[id]) done++;
        const row = document.createElement('div');
        row.className = 'line';
        const t = document.createElement('div');
        t.className = 'lt';
        t.innerHTML = `<b></b><small></small>`;
        t.querySelector('b').textContent = text;
        t.querySelector('small').textContent = `語氣：${MOOD[def.mood]}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rec';
        btn.textContent = recs[id] ? '🔁 重錄' : '⏺ 錄音';
        btn.onclick = () => (rec && recKey === id ? stopRec() : !rec && startRec(id, btn));
        row.append(t, btn);
        if (recs[id]) {
          const a = document.createElement('audio');
          a.controls = true;
          a.src = recs[id].url;
          row.append(a);
        }
        box.append(row);
      });
    }
    const all = Object.keys(recs).length;
    $('count').textContent = `呢個聲線錄咗 ${done}／${total} 句，總共錄咗 ${all} 句。`;
  }

  document.querySelectorAll('.seg button').forEach((b) => {
    b.onclick = () => {
      gender = b.dataset.g;
      document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
      render();
    };
  });
  $('dlAll').onclick = async () => {
    const ids = Object.keys(recs);
    if (!ids.length) return ($('count').textContent = '未有錄音。');
    for (const id of ids) {
      const a = document.createElement('a');
      a.href = recs[id].url;
      a.download = `${id}.${recs[id].ext}`;
      document.body.append(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 400)); // 瀏覽器一次下載太多會擋
    }
  };
  fetch('voice/lines.json').then((r) => r.json()).then((j) => { lines = j.hk || {}; render(); });
})();
