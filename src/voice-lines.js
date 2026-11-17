'use strict';
// 固定配音台詞（香港版）：預先產生、驗證後放在 public/voice/hk/，遊戲中不再呼叫語音模型。
// key 對應前端的喊話時機；mood 決定語氣（0 開心 – 4 暴怒）。
module.exports = {
  hk: {
    rage: { mood: 4, lines: ['有冇搞錯呀！', '你認真㗎？', '嬲死我喇！'] },
    out: { mood: 3, lines: ['拜拜喇。', '收皮啦你。', '走好唔送。'] },
    win: { mood: 0, lines: ['好嘢！', '算你叻。'] },
    shield: { mood: 1, lines: ['醒目喎。', '算你好彩。'] },
    happy: { mood: 0, lines: ['唔錯喎。', '咁先啱嘛。'] },
    timeout: { mood: 3, lines: ['藍剔唔覆？好，我記住。', '扮瞓呀嘛？'] },
    blame: { mood: 2, lines: ['甩鑊時間！'], narrator: true },
    accuse: { mood: 2, lines: ['指證時間，邊個係內鬼？'], narrator: true },
    caught: { mood: 0, lines: ['捉到你喇！'], narrator: true },
    escaped: { mood: 3, lines: ['俾佢走甩咗！'], narrator: true },
  },
};
