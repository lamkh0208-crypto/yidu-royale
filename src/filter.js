'use strict';
// 輸入過濾：個資遮蔽 + 明確違規字詞遮蔽。刻意不擋一般台灣口語（靠北、傻眼…）。

const BAD_WORDS = [
  '幹你娘', '幹你老', '操你媽', '操你', '肏', '雞掰', '機掰', '臭婊', '婊子', '賤貨',
  '去死', '自殺', '強姦', '強暴', '支那', '尼哥', '死甲', '死gay', '智障', '殘廢',
];

const PII_PATTERNS = [
  /[\w.+-]+@[\w-]+(\.[\w-]+)+/g,           // email
  /09\d{2}[-\s]?\d{3}[-\s]?\d{3}/g,        // 手機
  /[A-Za-z][12]\d{8}/g,                    // 身分證
  /\d{8,}/g,                               // 長數字串（卡號、電話）
];

function stripControl(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(text, maxLen) {
  let s = stripControl(text);
  s = Array.from(s).slice(0, maxLen).join('');
  for (const re of PII_PATTERNS) s = s.replace(re, '＊＊＊');
  for (const w of BAD_WORDS) s = s.split(w).join('＊'.repeat(Math.min(w.length, 3)));
  return s;
}

function cleanName(name) {
  const s = clean(name, 8).replace(/[<>@]/g, '');
  return s || '無名氏';
}

module.exports = { clean, cleanName, stripControl };
