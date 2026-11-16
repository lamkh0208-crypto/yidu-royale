# 已讀不回大逃殺

1–12 人即時連線的聊天室淘汰賽（不足 4 人自動補 AI 路人，一個人也能玩）。虛構角色（老闆、前任、親戚…）在群組裡逼問，玩家限時回覆且必須包含關鍵字；每輪回得最爛的幾句各扣一條命，三條命扣完出局當觀眾。

## 執行

```bash
npm install
```

```bash
npm start
```

打開 `http://localhost:3000`，開房後把邀請連結傳給朋友（同一個 Wi-Fi 用電腦的區網 IP，或部署到雲端）。

不設定任何金鑰就是**純投票模式**（手寫劇情 + 玩家投票）。要啟用 AI，把 `.env.example` 裡的變數設到環境中，例如：

```bash
AI_PROVIDERS=gemini GEMINI_API_KEY=你的金鑰 npm start
```

## 測試

```bash
npm test
```

用機器人各玩完整一局，涵蓋單人＋AI 路人、純投票、模擬 AI、AI 金鑰無效自動退回等情況。

```bash
AI_PROVIDERS=gemini GEMINI_API_KEY=你的金鑰 npm run eval -- 10
```

對真實 AI 重複判定同一組回覆，回報格式正確率、評分穩定度、引用前情比例、提示詞注入防禦率。

## 部署

需要支援 WebSocket 的長駐主機。Render：新增 Web Service，Build `npm install`、Start `npm start`，在 Environment 填金鑰。Fly.io：用附的 `Dockerfile`，`fly launch` 後 `fly secrets set GEMINI_API_KEY=...`。房間狀態存在記憶體，請只開一台機器。

設計細節見 [docs/DESIGN.md](docs/DESIGN.md)，上線前檢查清單見 [docs/LAUNCH.md](docs/LAUNCH.md)。
