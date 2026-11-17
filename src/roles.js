'use strict';
// 身分系統（狼人殺式）：每位玩家有公開身分、私人背景與不可告人的祕密。
// 角色（參考狼人殺）：
//   內鬼（狼人）：真正搞出這件事的人；一局一次「栽贓」。
//   知情者（預言家）：一局兩次「查手機」，查一個人是不是內鬼。
//   和事佬（守衛）：每輪保一個人，那人這輪少扣一條命；不能連續兩輪保同一人，也不能保自己。（5 人以上才有）
//   路人（村民）：沒有能力，靠推理。
// 最後一輪結束後大家指證內鬼：抓到了正義勝利，抓錯了內鬼逃脫。

const crypto = require('crypto');
const pick = (a) => a[crypto.randomInt(a.length)];
const shuffle = (a) => {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// 沒有 AI 時的保底身分：公開身分、背景、祕密各自抽，組合起來就夠多樣。
const POOL = {
  tw: {
    identity: ['新來的實習生', '待了十年的老鳥', '管帳的財務', '八卦情報站', '永遠在潛水的人', '外包廠商窗口', '剛休完長假的人', '負責訂便當的人', 'IT 小幫手', '主管的遠房親戚', '準備離職的人', '最會拍馬屁的人'],
    backstory: [
      '每天最早到、最晚走，但沒有人記得你做過什麼。',
      '上個月才被罵過一次，這個月不能再出包。',
      '和群組裡每個人都吃過飯，知道太多事情。',
      '手機永遠靜音，已讀總是隔天才發生。',
      '表面上什麼都不管，其實什麼都看在眼裡。',
      '剛被拉進這個群組，連大家的名字都還叫不出來。',
      '人緣很好，但最近和某個人鬧得有點僵。',
      '是群組裡唯一會回「收到」的人。',
    ],
    secret: [
      '你上週偷偷用公司的錢買了宵夜，還沒報帳。',
      '你其實根本沒看過群組上面的訊息。',
      '你暗戀群組裡的某個人，絕對不能說。',
      '你已經在找下一份工作，面試就在明天。',
      '你把一份重要文件弄丟了，到現在還沒說。',
      '你在另一個小群組裡說過大家的壞話。',
      '你昨晚根本不在你說的地方。',
      '你欠群組裡的某個人五千塊。',
    ],
  },
  hk: {
    identity: ['啱入職嘅實習生', '做咗十年嘅老鬼', '管數嘅會計', '八卦情報站', '長期潛水員', '外判公司代表', '啱放完長假嘅人', '負責叫外賣嘅人', 'IT 小幫手', '老細嘅遠房親戚', '準備辭職嘅人', '擦鞋專家'],
    backstory: [
      '日日最早返最遲走，但冇人記得你做過乜。',
      '上個月先俾人鬧完，今個月唔可以再出事。',
      '同 group 入面個個都食過飯，知得太多嘢。',
      '部電話永遠靜音，藍剔總係第二朝先出現。',
      '表面乜都唔理，其實乜都睇晒。',
      '啱啱先俾人拉入呢個 group，連大家個名都未記得晒。',
      '人緣好好，但最近同某個人有啲嗰嗰哋。',
      '係 group 入面唯一會覆「收到」嘅人。',
    ],
    secret: [
      '你上個禮拜偷偷用公司啲錢買咗宵夜，仲未報數。',
      '你根本冇睇過 group 上面啲訊息。',
      '你暗戀緊 group 入面某個人，打死都唔可以講。',
      '你已經搵緊下一份工，聽日就去見工。',
      '你整唔見咗一份重要文件，到而家都未講。',
      '你喺另一個細 group 講過大家壞話。',
      '你尋晚根本唔喺你話嘅地方。',
      '你爭 group 入面某個人五千蚊。',
    ],
  },
};

const TEXT = {
  tw: {
    roleName: { insider: '內鬼', witness: '知情者', guard: '和事佬', civilian: '路人' },
    goal: {
      insider: '這件事其實是你搞出來的（或你有份）。撐到最後別被指證，必要時把鍋甩給別人。你有一次「栽贓」可以用。',
      witness: '你有兩次「查手機」：每次查一個人是不是內鬼。最後指證時帶大家抓出內鬼，但別讓內鬼發現你知道。',
      guard: '每輪可以「勸和」一個人，他這輪少扣一條命（不能保自己，也不能連續兩輪保同一人）。幫好人撐到最後。',
      civilian: '你是清白的，但也有不想被知道的事。活下去，最後指證出真正的內鬼。',
    },
    insiderSecret: (t) => `《${t}》出事那晚，你就在現場，而且動過手腳。`,
    witnessHint: (a, b) => `你看到內鬼是「${a}」或「${b}」其中一個。`,
    dealt: '🎭 身分已發放：每個人都有自己的背景和祕密，其中一人是內鬼。點右上角 🎭 看你的身分卡。',
    roster: (list) => `群組成員：${list}`,
    clue: (a, b) => `出事那段時間，有人看到「${a}」或「${b}」出現在附近。`,
    clueTitle: '新線索',
    frame: (id) => `有人匿名貼出一張照片，看起來像是「${id}」在現場。`,
    framed: (name) => `你栽贓了 ${name}，下一輪會出現對他不利的「證據」。`,
    accuseOpen: '🕵️ 指證時間：內鬼就在你們之中。所有人（包括亡靈）投票指出內鬼！',
    caught: (name, id) => `🕵️ 抓到了！內鬼就是 ${name}（${id}）。`,
    escaped: (name, id, wrong) => `🎭 內鬼逃脫：真正的內鬼是 ${name}（${id}）${wrong ? `，大家卻冤枉了 ${wrong}` : ''}。`,
    tie: '票數平手，沒有人被指證。',
    accusedDesc: (n) => `被 ${n} 人指證為內鬼`,
    checkAsk: (n) => `📱 查手機（還有 ${n} 次）：選一個人，看他是不是內鬼。`,
    checkResult: (name, yes) => (yes ? `你查了 ${name} 的手機：他就是內鬼！` : `你查了 ${name} 的手機：他不是內鬼。`),
    guardAsk: '🤝 勸和：選一個人，他這輪少扣一條命。',
    guardOn: (name) => `這輪你在保 ${name}。`,
    guarded: (name) => `🤝 有人出面打圓場，${name} 少扣了一條命`,
    awardDetective: ['🕵️', '神探', (n) => `指證正確（${n} 人）`],
    awardActor: ['🎬', '影帝', () => '當了整局內鬼還全身而退'],
  },
  hk: {
    roleName: { insider: '內鬼', witness: '知情人', guard: '和事佬', civilian: '路人' },
    goal: {
      insider: '呢件事其實係你搞出嚟（或者你有份）。捱到最後唔好俾人指證，有需要就將隻鑊甩俾人。你有一次「插贓」可以用。',
      witness: '你有兩次「睇電話」：每次查一個人係唔係內鬼。最後指證時帶大家捉個內鬼出嚟，但唔好俾內鬼知你知。',
      guard: '每輪可以「勸交」一個人，佢今輪少扣一條命（唔可以保自己，亦唔可以連續兩輪保同一個）。幫好人捱到最後。',
      civilian: '你係清白嘅，不過都有啲唔想俾人知嘅嘢。生存落去，最後指證真正嘅內鬼。',
    },
    insiderSecret: (t) => `《${t}》出事嗰晚，你就喺現場，仲郁過手腳。`,
    witnessHint: (a, b) => `你見到內鬼係「${a}」或者「${b}」其中一個。`,
    dealt: '🎭 身分派咗：每個人都有自己嘅背景同祕密，其中一個係內鬼。㩒右上角 🎭 睇你張身分卡。',
    roster: (list) => `群組成員：${list}`,
    clue: (a, b) => `出事嗰段時間，有人見到「${a}」或者「${b}」喺附近出現。`,
    clueTitle: '新線索',
    frame: (id) => `有人匿名 send 咗張相出嚟，睇落好似係「${id}」喺現場。`,
    framed: (name) => `你插咗 ${name} 贓，下一輪會出現對佢唔利嘅「證據」。`,
    accuseOpen: '🕵️ 指證時間：內鬼就喺你哋中間。所有人（包括亡靈）投票指出內鬼！',
    caught: (name, id) => `🕵️ 捉到喇！內鬼就係 ${name}（${id}）。`,
    escaped: (name, id, wrong) => `🎭 內鬼走甩：真正嘅內鬼係 ${name}（${id}）${wrong ? `，大家反而冤枉咗 ${wrong}` : ''}。`,
    tie: '票數打和，冇人俾人指證。',
    accusedDesc: (n) => `俾 ${n} 個人指證做內鬼`,
    checkAsk: (n) => `📱 睇電話（仲有 ${n} 次）：揀一個人，睇佢係唔係內鬼。`,
    checkResult: (name, yes) => (yes ? `你睇咗 ${name} 部電話：佢就係內鬼！` : `你睇咗 ${name} 部電話：佢唔係內鬼。`),
    guardAsk: '🤝 勸交：揀一個人，佢今輪少扣一條命。',
    guardOn: (name) => `今輪你保緊 ${name}。`,
    guarded: (name) => `🤝 有人出嚟打圓場，${name} 少扣咗一條命`,
    awardDetective: ['🕵️', '神探', (n) => `指證正確（${n} 人）`],
    awardActor: ['🎬', '影帝', () => '做咗成局內鬼仲全身而退'],
  },
};

const text = (locale) => TEXT[locale] || TEXT.tw;

// 決定誰是內鬼、誰是知情者，並先用保底內容填好每個人的身分。之後 AI 回來的身分卡會覆蓋保底內容。
function deal(players, locale, title) {
  const pool = POOL[locale] || POOL.tw;
  const T = text(locale);
  const order = shuffle(players);
  const insider = order[0];
  const witness = players.length >= 3 ? order[1] : null;
  const guard = players.length >= 5 ? order[2] : null;
  const ids = shuffle(pool.identity), bgs = shuffle(pool.backstory), secrets = shuffle(pool.secret);
  players.forEach((p, i) => {
    p.role = p === insider ? 'insider' : p === witness ? 'witness' : p === guard ? 'guard' : 'civilian';
    p.checks = p.role === 'witness' ? 2 : 0;
    p.checked = [];
    p.lastGuard = '';
    p.identity = ids[i % ids.length];
    p.backstory = bgs[i % bgs.length];
    p.secret = p.role === 'insider' ? T.insiderSecret(title) : secrets[i % secrets.length];
    p.framed = false;
  });
  return { insider, witness, guard };
}

// 把 AI 寫的身分卡套到玩家身上（只接受名單上的玩家，缺的維持保底）。
function applyCast(players, cast) {
  if (!cast || !Array.isArray(cast.roles)) return false;
  let n = 0;
  for (const r of cast.roles) {
    const p = players.find((x) => x.name === r.player);
    if (!p) continue;
    if (r.identity) p.identity = r.identity;
    if (r.backstory) p.backstory = r.backstory;
    if (r.secret) p.secret = r.secret;
    n++;
  }
  return n > 0;
}

module.exports = { deal, applyCast, text, POOL };
