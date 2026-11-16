'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const h = (tag, props, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  };
  // replaceChildren 會把 null 印成文字，所以先濾掉。
  const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));

  // ---------- 自繪頭像（不使用任何外部圖片） ----------
  const MOUTHS = ['M11 23 Q18 29 25 23', 'M12 25 H24', 'M11 26 Q18 20 25 26', 'M13 23 Q18 27 23 23 Q18 31 13 23', 'M12 24 Q15 21 18 24 T24 24', 'M15 22 a3 3.5 0 1 0 6 0 a3 3.5 0 1 0 -6 0'];
  function avatar(hue, face, npc) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.setAttribute('class', 'av');
    const add = (tag, attrs) => {
      const e = document.createElementNS(ns, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      svg.append(e);
    };
    if (npc) {
      add('rect', { width: 36, height: 36, rx: 10, fill: `hsl(${hue} 25% 30%)` });
      add('path', { d: 'M8 13 L15 15 M28 13 L21 15', stroke: '#fff', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
      add('circle', { cx: 13, cy: 18, r: 1.8, fill: '#fff' });
      add('circle', { cx: 23, cy: 18, r: 1.8, fill: '#fff' });
      add('path', { d: 'M12 26 H24', stroke: '#fff', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
    } else {
      add('circle', { cx: 18, cy: 18, r: 18, fill: `hsl(${hue} 70% 62%)` });
      add('circle', { cx: 12.5, cy: 15, r: 2.2, fill: '#1b1b1b' });
      add('circle', { cx: 23.5, cy: 15, r: 2.2, fill: '#1b1b1b' });
      add('path', { d: MOUTHS[face % MOUTHS.length], stroke: '#1b1b1b', 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round' });
    }
    return svg;
  }
  // 出題角色的表情：0 開心、1 滿意、2 無言、3 不爽、4 暴怒
  const MOOD_LABEL = ['😊 開心', '🙂 滿意', '😐 無言', '😒 不爽', '🤬 暴怒'];
  const MOOD_DELTA = [-12, -5, 3, 10, 18];
  function npcFace(hue, mood) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    const add = (tag, attrs) => {
      const e = document.createElementNS(ns, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      svg.append(e);
      return e;
    };
    const bg = ['hsl(' + hue + ' 45% 44%)', 'hsl(' + hue + ' 30% 36%)', 'hsl(' + hue + ' 15% 32%)', 'hsl(18 55% 38%)', 'hsl(0 78% 44%)'][mood];
    add('rect', { width: 64, height: 64, rx: 18, fill: bg });
    const line = { stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' };
    const brows = ['M13 20 Q20 14 27 20 M37 20 Q44 14 51 20', 'M14 19 H26 M38 19 H50', 'M14 22 H26 M38 22 H50', 'M13 17 L27 23 M51 17 L37 23', 'M12 13 L28 24 M52 13 L36 24'][mood];
    add('path', { d: brows, ...line });
    if (mood === 2) add('path', { d: 'M17 31 H25 M39 31 H47', ...line });
    else {
      add('circle', { cx: 21, cy: 31, r: mood === 4 ? 4 : 3.4, fill: '#fff' });
      add('circle', { cx: 43, cy: 31, r: mood === 4 ? 4 : 3.4, fill: '#fff' });
    }
    if (mood === 4) {
      add('ellipse', { cx: 32, cy: 48, rx: 11, ry: 7, fill: '#2a0505', stroke: '#fff', 'stroke-width': 3 });
      add('path', { d: 'M23 45 H41', stroke: '#fff', 'stroke-width': 3 });
      add('path', { d: 'M50 6 l5 5 M55 6 l-5 5 M47 9 h11 M52.5 3 v11', stroke: '#ffd23f', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
    } else {
      const mouth = ['M19 43 Q32 57 45 43', 'M22 46 Q32 52 42 46', 'M23 48 H41', 'M21 51 Q32 41 43 51'][mood];
      add('path', { d: mouth, ...line });
    }
    return svg;
  }
  const moodOfAnger = (a) => (a < 30 ? 1 : a < 55 ? 2 : a < 80 ? 3 : 4);
  const hueOf = (s) => [...s].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 7);

  // ---------- 狀態 ----------
  let ws = null;
  let S = null; // 伺服器送來的最新快照
  let deadline = 0;
  let rendered = 0; // 已畫出的 log 筆數
  let dockKey = '';
  let queue = []; // 等待逐則公布的聊天紀錄
  let qTimer = null;
  let firstSync = true;
  let lastTick = 0;
  const shownLives = {};
  let shownAnger = 20;
  let stageMood = -1;
  let stageWho = '';
  let topicDraft = '';
  let retry = 0;
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* 無痕模式 */ } },
  };
  const savedName = (() => { try { return localStorage.getItem('yd_name') || ''; } catch (e) { return ''; } })();

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.hidden = true), 2200);
  }

  // ---------- 連線 ----------
  function connect(first) {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
    ws.onopen = () => {
      retry = 0;
      ws.send(JSON.stringify(first));
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'state') onState(m);
      else if (m.t === 'emoji') { floater(m.e); Sound.play('emoji'); }
      else if (m.t === 'error') {
        if (m.fatal || !S) {
          store.set('yd_code', '');
          S = null;
          show('home');
          $('homeErr').textContent = m.msg;
          ws.onclose = null;
          ws.close();
        } else toast(m.msg);
      }
    };
    ws.onclose = () => {
      if (!S) return;
      toast('連線中斷，重新連線中…');
      setTimeout(() => connect({ t: 'join', code: S.code, name: store.get('yd_nm'), token: S.you.token }), Math.min(5000, 600 * 2 ** retry++));
    };
  }
  const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

  function show(id) {
    $('home').hidden = id !== 'home';
    $('game').hidden = id !== 'game';
  }

  function enter(kind) {
    const name = $('name').value.trim();
    const code = $('code').value.trim().toUpperCase();
    $('homeErr').textContent = '';
    if (!name) return ($('homeErr').textContent = '先取個暱稱');
    if (kind === 'join' && code.length !== 4) return ($('homeErr').textContent = '房間碼是四個英文字母');
    try { localStorage.setItem('yd_name', name); } catch (e) { /* ignore */ }
    store.set('yd_nm', name);
    Sound.init();
    connect(kind === 'create' ? { t: 'create', name } : { t: 'join', code, name });
  }

  // ---------- 畫面 ----------
  const PHASE_LABEL = {
    LOBBY: '等待開始', INTRO: '對方正在輸入…', ANSWER: '快回訊息！', VOTE: '投票：最想救哪一句？',
    JUDGE: '判定中…', REVEAL: '公布結果', OVER: '本局結束',
  };

  function onState(m) {
    const prev = S;
    S = m;
    deadline = m.remain ? Date.now() + m.remain : 0;
    store.set('yd_code', m.code);
    store.set('yd_token', m.you.token);
    if (!prev) {
      show('game');
      history.replaceState(null, '', `?room=${m.code}`);
    }
    if (!prev) firstSync = true;
    if (!prev || prev.phase !== m.phase) {
      Sound.setMood(m.phase === 'LOBBY' || m.phase === 'OVER' ? 'lobby' : m.phase === 'ANSWER' ? 'tense' : 'idle');
      if (prev && m.phase === 'ANSWER' && navigator.vibrate) navigator.vibrate(60);
      if (prev && prev.phase === 'LOBBY' && m.phase === 'INTRO') Sound.play('start');
      if (prev && m.phase === 'VOTE') Sound.play('pop');
    }
    render();
    firstSync = false;
  }

  function me() {
    return S.players.find((p) => p.id === S.you.id) || {};
  }

  function render() {
    $('btnCode').textContent = S.code;
    let label = PHASE_LABEL[S.phase];
    if (S.round && S.phase !== 'OVER' && S.phase !== 'LOBBY') label = `R${S.round}｜${S.criterion ? S.criterion.name : label}`;
    $('phaseLabel').textContent = label;

    renderPlayers();
    $('rules').hidden = !(S.phase === 'LOBBY' && !S.log.length);

    // 聊天紀錄（只補新的）
    const log = $('log');
    if (S.log.length < rendered) {
      log.replaceChildren();
      rendered = 0;
      queue = [];
      clearTimeout(qTimer);
      qTimer = null;
    }
    for (; rendered < S.log.length; rendered++) {
      if (firstSync) appendEntry(S.log[rendered], true);
      else queue.push(S.log[rendered]);
    }
    if (firstSync) log.scrollTop = log.scrollHeight;
    else if (!qTimer) pump();
    // 已讀人數：作答中即時更新在最後一則角色訊息下面
    if (S.phase === 'ANSWER') {
      const reads = log.querySelectorAll('.read');
      const n = S.players.filter((p) => p.done).length;
      if (reads.length) reads[reads.length - 1].textContent = n ? `已讀 ${n}` : '';
    }

    if (!queue.length && !qTimer) syncStage();
    $('stage').hidden = !(S.round && S.npc && S.phase !== 'LOBBY' && S.phase !== 'OVER');
    $('stage').classList.toggle('reading', S.phase === 'JUDGE');
    $('typing').hidden = !S.typing;
    $('typingName').textContent = S.typing;
    renderDock();
    tick();
  }

  // 舞台：出題角色的大頭、表情與怒氣值
  function setStage(who, mood, anger, hit) {
    const st = $('stage');
    if (who !== stageWho || mood !== stageMood) {
      $('stageFace').replaceChildren(npcFace(hueOf(who), mood));
      $('stageName').textContent = who;
      $('stageMood').textContent = MOOD_LABEL[mood];
      st.className = `stage m${mood}${st.classList.contains('reading') ? ' reading' : ''}`;
    }
    stageWho = who;
    stageMood = mood;
    shownAnger = Math.max(0, Math.min(100, anger));
    $('angerBar').style.width = `${shownAnger}%`;
    $('angerNum').textContent = `怒氣 ${Math.round(shownAnger)}`;
    if (hit) {
      st.classList.remove('hit');
      void st.offsetWidth; // 重新觸發動畫
      st.classList.add('hit');
    }
    Sound.setEmotion(shownAnger < 30 ? 0 : shownAnger < 55 ? 1 : shownAnger < 80 ? 2 : 3);
  }
  function syncStage() {
    if (S.npc) setStage(S.npc, moodOfAnger(S.anger), S.anger, false);
    else if (S.phase === 'LOBBY' || S.phase === 'OVER') Sound.setEmotion(0);
  }

  // 公布結果時一則一則跳出來，扣命的心也跟著掉，比較有戲。
  function pump() {
    qTimer = null;
    while (queue.length) {
      const e = queue.shift();
      appendEntry(e, false);
      const next = queue[0];
      if (next && next.k === 'reply') {
        qTimer = setTimeout(pump, S.phase === 'REVEAL' ? 1300 : 120);
        break;
      }
    }
    renderPlayers();
    if (!queue.length && !qTimer) setTimeout(() => !queue.length && !qTimer && syncStage(), 1200);
  }

  function appendEntry(e, silent) {
    const log = $('log');
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 160;
    const el = renderEntry(e);
    log.append(el);
    if (stick || e.pid === S.you.id) log.scrollTop = log.scrollHeight;
    if (silent) return;
    if (e.k === 'npc') Sound.play('msg');
    else if (e.k === 'reply') {
      // 角色讀到這句回覆：換表情、怒氣值跟著跳
      if (e.mood != null) setStage(e.who, e.mood, shownAnger + MOOD_DELTA[e.mood], true);
      if (e.mood === 4) Sound.play('rage'); else if (e.mood === 0) Sound.play('happy');
      Sound.play(e.out ? 'out' : e.lost ? 'lost' : 'pop');
      if (e.lost && e.pid === S.you.id && navigator.vibrate) navigator.vibrate([80, 60, 80]);
    } else if (e.k === 'sys') {
      if (e.text.startsWith('🏆')) Sound.play('win');
      else if (e.text.startsWith('👻')) Sound.play('ghost');
    }
  }

  function renderPlayers() {
    const pending = {};
    for (const e of queue) if (e.k === 'reply' && e.lost) pending[e.pid] = (pending[e.pid] || 0) + 1;
    $('players').replaceChildren(
      ...S.players.map((p) => {
        const lives = p.lives + (pending[p.id] || 0);
        const hurt = shownLives[p.id] != null && lives < shownLives[p.id];
        shownLives[p.id] = lives;
        return h('div', { class: `pl${p.id === S.you.id ? ' me' : ''}${S.round && !lives ? ' dead' : ''}${p.connected ? '' : ' off'}${hurt ? ' hurt' : ''}` },
          p.host && h('span', { class: 'crown' }, '👑'),
          p.done && h('span', { class: 'done' }, '✓'),
          avatar(p.hue, p.face),
          h('div', { class: 'hp' }, S.round ? (lives ? '♥'.repeat(lives) : '💀') : ''),
          h('div', { class: 'nm' }, p.name));
      })
    );
  }

  function renderEntry(e) {
    if (e.k === 'sys') return h('div', { class: 'sys' }, e.text);
    if (e.k === 'npc') {
      return h('div', { class: 'msg npc' }, avatar(hueOf(e.who), 0, true),
        h('div', { class: 'body' },
          h('div', { class: 'who' }, e.who),
          h('div', { class: 'bubble' }, e.target && h('span', { class: 'at' }, `@${e.target} `), e.text),
          h('div', {}, h('span', { class: 'kw' }, `回覆必須包含「${e.keyword}」`), h('span', { class: 'read' }))
        ));
    }
    const mine = e.pid === S.you.id;
    const meta = [];
    if (e.mood != null) meta.push(h('span', {}, MOOD_LABEL[e.mood]));
    if (e.score != null) meta.push(h('span', {}, `${e.score} 分`));
    if (e.votes) meta.push(h('span', {}, `🛟 ${e.votes} 票`));
    if (e.missing) meta.push(h('span', { class: 'bad' }, '沒有關鍵字'));
    if (e.lost) meta.push(h('span', { class: 'bad' }, e.out ? '💀 出局' : '−1 條命'));
    return h('div', { class: `msg reveal${mine ? ' mine' : ''}${e.lost ? ' lost' : ''}` }, avatar(e.hue, e.face),
      h('div', { class: 'body' },
        h('div', { class: 'who' }, e.name),
        h('div', { class: `bubble${e.ghost ? ' ghost' : ''}` }, e.ghost ? '（已讀不回）' : e.text),
        h('div', { class: 'meta' }, meta),
        h('div', { class: 'roast' }, h('small', {}, `${e.who} 回覆：`), e.roast)
      ));
  }

  function renderDock() {
    const my = me();
    const alive = my.lives > 0;
    const key = [S.phase, S.round, alive, S.myReply, S.myVote, my.host, JSON.stringify(S.ghost || 0), S.phase === 'LOBBY' ? S.players.filter((p) => p.connected).length : 0].join('|');
    if (key === dockKey) return;
    dockKey = key;
    const dock = $('dock');
    const emojiBar = () => h('div', { class: 'emojis' }, S.emojis.map((e) => h('button', { onclick: () => send({ t: 'emoji', e }) }, e)));

    // 亡靈面板：寫判定詞 + 投票決定下一輪用哪個
    const ghostPanel = () => {
      const g = S.ghost;
      if (!g) return null;
      const old = dock.querySelector('.gword');
      const input = h('input', { class: 'gword', maxlength: g.max, autocomplete: 'off', enterkeyhint: 'send',
        placeholder: g.myWord ? `你的判定詞：「${g.myWord}」（可改）` : '寫一個判定詞，例：最油、最像渣男' });
      if (old) input.value = old.value;
      const submit = () => {
        const text = input.value.trim();
        if (text) { send({ t: 'word', text }); input.value = ''; Sound.play('ghost'); }
      };
      input.addEventListener('keydown', (ev) => ev.key === 'Enter' && !ev.isComposing && submit());
      return h('div', { class: 'stack ghostbox' },
        h('p', { class: 'hint' }, g.myWord ? '👻 亡靈投票：最高票的判定詞就是下一輪的扣命標準。' : h('span', {}, '👻 你是亡靈：', h('b', {}, '寫一個判定詞'), '，亡靈們投票，最高票的詞就是下一輪的扣命標準。')),
        h('div', { class: 'row' }, input, h('button', { onclick: submit }, g.myWord ? '改' : '寫好了')),
        g.words.length ? h('div', { class: 'ballot' }, g.words.map((w) => {
          const blocked = w.mine && !g.solo;
          return h('button', { class: `${blocked ? 'own' : ''}${g.myVote === w.pid ? ' sel' : ''}`, disabled: !g.canVote || blocked,
            onclick: () => { send({ t: 'gvote', pid: w.pid }); Sound.play('vote'); } }, `「${w.text}」— ${w.name}${w.mine ? '（你）' : ''}　${w.votes} 票`);
        })) : null,
        g.words.length && !g.canVote ? h('p', { class: 'hint' }, '下一題出現、活人作答時開放投票。') : null);
    };

    if (S.phase === 'LOBBY') {
      const n = S.players.filter((p) => p.connected).length;
      fill(dock, h('div', { class: 'stack' },
        h('p', { class: 'hint' }, `房間碼 `, h('b', {}, S.code), `，目前 ${n} 人（${S.minPlayers}–12 人可開始）。`,
          S.aiEnabled ? ' AI 裁判已就緒。' : ' 未設定 AI，本局為純投票模式。'),
        h('button', { class: 'ghost', onclick: invite }, '📎 分享邀請連結'),
        my.host && S.aiEnabled && (() => {
          const inp = h('input', { maxlength: 30, autocomplete: 'off', placeholder: '本局主題（選填）例：演唱會搶票、颱風假放不放' });
          inp.value = topicDraft;
          inp.addEventListener('input', () => (topicDraft = inp.value));
          return inp;
        })(),
        my.host
          ? h('button', { class: 'primary', disabled: n < S.minPlayers, onclick: () => send({ t: 'start', topic: topicDraft }) }, n < S.minPlayers ? `還差 ${S.minPlayers - n} 人` : '開始遊戲')
          : h('p', { class: 'hint' }, '等房主按開始…')
      ));
    } else if (S.phase === 'ANSWER' && alive && !S.myReply) {
      const input = h('input', { maxlength: S.replyMax, placeholder: `回覆要包含「${S.keyword}」`, autocomplete: 'off', enterkeyhint: 'send' });
      const count = h('div', { class: 'count' });
      const upd = () => {
        const ok = input.value.toLowerCase().includes(S.keyword.toLowerCase());
        count.textContent = `${ok ? '✓ 有關鍵字' : `還沒出現「${S.keyword}」`}｜${[...input.value].length}/${S.replyMax}`;
        count.className = `count${ok ? '' : ' bad'}`;
      };
      const submit = () => {
        const text = input.value.trim();
        if (text) { send({ t: 'reply', text }); Sound.play('send'); }
      };
      input.addEventListener('input', upd);
      input.addEventListener('keydown', (ev) => ev.key === 'Enter' && !ev.isComposing && submit());
      upd();
      fill(dock, 
        h('p', { class: 'hint' }, `本輪標準：`, h('b', {}, S.criterion.name), `（${S.criterion.desc}）`),
        h('div', { class: 'row' }, input, h('button', { onclick: submit }, '送出')), count);
      input.focus();
    } else if (S.phase === 'ANSWER') {
      fill(dock, h('p', { class: 'hint' }, alive ? `已送出：「${S.myReply}」，等其他人…` : '活人作答中。等等可以投票救人。'), ghostPanel(), emojiBar());
    } else if (S.phase === 'VOTE') {
      fill(dock, 
        h('p', { class: 'hint' }, S.myVote ? '已投票，等其他人…' : h('span', {}, '匿名投票：', h('b', {}, '你最想救哪一句？'), '（不能投自己）')),
        h('div', { class: 'ballot' }, S.ballot.map((b) =>
          h('button', { class: `${b.mine ? 'own' : ''}${S.myVote === b.rid ? ' sel' : ''}`, disabled: b.mine || !!S.myVote,
            onclick: () => { send({ t: 'vote', rid: b.rid }); Sound.play('vote'); } }, b.mine ? `（你的）${b.text}` : b.text))));
    } else if (S.phase === 'OVER' && S.result) {
      const r = S.result;
      fill(dock, h('div', { class: 'stack result' },
        h('h2', {}, r.winner ? `🏆 ${r.winner.name} 活到最後` : '無人生還'),
        h('p', {}, `《${r.title}》共 ${r.rounds} 輪`),
        h('div', { class: 'rank' }, r.ranking.slice(0, 6).map((x, i) => h('span', { class: x.id === S.you.id ? 'me' : '' }, `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${x.name}${x.lives ? ' ' + '♥'.repeat(x.lives) : ''}`))),
        h('div', { class: 'two' },
          r.best && h('button', { class: 'ghost', onclick: shareCard }, '🖼 最神回覆卡'),
          h('button', { class: 'ghost', onclick: invite }, '📎 邀請連結')),
        my.host ? h('button', { class: 'primary', onclick: () => send({ t: 'again' }) }, '再來一局') : h('p', {}, '等房主按「再來一局」…')
      ));
    } else {
      fill(dock, h('p', { class: 'hint' }, S.phase === 'REVEAL' ? '看看大家回了什麼 👀' : S.phase === 'JUDGE' ? `${S.npc || '對方'} 正在已讀大家的回覆…` : '準備好，訊息要來了…'), ghostPanel(), emojiBar());
    }
  }

  function tick() {
    if (!S) return;
    const left = deadline ? Math.max(0, deadline - Date.now()) : 0;
    const clock = $('clock');
    clock.textContent = deadline ? Math.ceil(left / 1000) : '';
    clock.className = `clock${left < 10000 && (S.phase === 'ANSWER' || S.phase === 'VOTE') ? ' hot' : ''}`;
    $('progress').style.width = deadline && S.total ? `${(left / S.total) * 100}%` : '0';
    const timed = S.phase === 'ANSWER' || S.phase === 'VOTE';
    const sec = Math.ceil(left / 1000);
    if (timed && deadline && sec <= 5 && sec > 0 && sec !== lastTick) {
      lastTick = sec;
      const my = me();
      if (S.phase === 'VOTE' ? !S.myVote : my.lives > 0 && !S.myReply) Sound.play('tick');
    }
    if (S.phase === 'ANSWER') Sound.setMood(left < 10000 ? 'panic' : 'tense');
  }
  setInterval(tick, 200);

  function floater(e) {
    const el = h('span', { class: 'fl' }, e);
    el.style.left = `${10 + Math.random() * 75}%`;
    $('floaters').append(el);
    setTimeout(() => el.remove(), 1900);
  }

  async function invite() {
    const url = `${location.origin}/?room=${S.code}`;
    try {
      if (navigator.share) await navigator.share({ title: '已讀不回大逃殺', text: `來玩！房間碼 ${S.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('邀請連結已複製');
      }
    } catch (e) {
      if (e && e.name !== 'AbortError') toast(`房間碼：${S.code}`);
    }
  }

  // ---------- 直式分享卡（1080×1920，全部用 canvas 自繪） ----------
  function wrap(ctx, text, maxW) {
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }
  function bubble(ctx, x, y, w, lines, lh, fill, color, tailLeft) {
    const hgt = lines.length * lh + 56;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x, y, w, hgt, tailLeft ? [12, 44, 44, 44] : [44, 12, 44, 44]);
    ctx.fill();
    ctx.fillStyle = color;
    lines.forEach((l, i) => ctx.fillText(l, x + 40, y + 28 + lh * (i + 0.75)));
    return y + hgt;
  }
  async function shareCard() {
    const b = S.result.best;
    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1920;
    const ctx = c.getContext('2d');
    const F = (px, w = 700) => `${w} ${px}px -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(0, 0, 1080, 16);
    ctx.font = F(44);
    ctx.fillText('已讀不回大逃殺', 80, 150);
    ctx.fillStyle = '#93a1ad';
    ctx.font = F(36, 500);
    ctx.fillText(`《${S.result.title}》第 ${b.round} 輪`, 80, 210);
    ctx.fillStyle = '#eef2f5';
    ctx.font = F(100, 900);
    ctx.fillText('本局最神回覆', 80, 380);

    let y = 500;
    ctx.fillStyle = '#93a1ad';
    ctx.font = F(36, 500);
    ctx.fillText(b.who, 80, y);
    ctx.font = F(46, 500);
    y = bubble(ctx, 80, y + 24, 800, wrap(ctx, b.question, 720), 66, '#232b34', '#eef2f5', true) + 90;

    ctx.fillStyle = '#93a1ad';
    ctx.font = F(36, 500);
    ctx.textAlign = 'right';
    ctx.fillText(b.name, 1000, y);
    ctx.textAlign = 'left';
    ctx.font = F(60, 800);
    const lines = wrap(ctx, b.text, 760);
    y = bubble(ctx, 160, y + 24, 840, lines, 84, '#3d7bff', '#ffffff', false) + 100;

    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(80, y, 8, 200);
    ctx.fillStyle = '#93a1ad';
    ctx.font = F(34, 500);
    ctx.fillText(`${b.who} 回覆：`, 120, y + 40);
    ctx.fillStyle = '#ffe9a3';
    ctx.font = F(50, 700);
    wrap(ctx, b.roast, 860).slice(0, 3).forEach((l, i) => ctx.fillText(l, 120, y + 110 + i * 68));

    ctx.fillStyle = '#93a1ad';
    ctx.font = F(36, 500);
    if (S.result.winner) ctx.fillText(`🏆 本局生還者：${S.result.winner.name}`, 80, 1740);
    ctx.fillText(`換你來回訊息 → ${location.host}`, 80, 1810);

    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = new File([blob], 'yidu-royale.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], title: '已讀不回大逃殺' });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: 'yidu-royale.png' });
    a.click();
    toast('已下載分享卡');
  }
  window.__card = shareCard;

  // ---------- 啟動 ----------
  $('name').value = savedName;
  const qRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4);
  if (qRoom) $('code').value = qRoom;
  $('btnJoin').onclick = () => enter('join');
  $('btnCreate').onclick = () => enter('create');
  $('code').addEventListener('keydown', (e) => e.key === 'Enter' && enter('join'));
  $('btnCode').onclick = invite;
  const SND = ['🔊', '🔔', '🔇'];
  $('btnSound').textContent = SND[Sound.mode];
  $('btnSound').onclick = () => {
    const m = Sound.cycle();
    $('btnSound').textContent = SND[m];
    toast(['音樂＋音效', '只有音效', '靜音'][m]);
  };
  // 重新整理後自動回房時還沒有點擊過，第一次觸碰畫面再啟動聲音
  document.addEventListener('pointerdown', () => Sound.init(), { once: true });
  // 重新整理後自動回到原房間
  if (store.get('yd_token') && store.get('yd_code') && (!qRoom || qRoom === store.get('yd_code'))) {
    connect({ t: 'join', code: store.get('yd_code'), name: store.get('yd_nm') || savedName, token: store.get('yd_token') });
  }
})();
