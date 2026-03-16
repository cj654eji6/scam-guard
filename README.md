# 詐騙訊息鑑定器 (ScamGuard)

LINE LIFF 應用，透過 AI 分析可疑訊息，判斷是否為詐騙。

## 技術架構

- **前端**：Nuxt 3 + Vue 3
- **後端**：Nuxt Server API
- **AI**：Claude API（Anthropic）
- **平台**：LINE LIFF SDK

## 給 AI 的環境建置指令

> 如果你沒有前端開發經驗，請將以下整段文字複製貼給 AI（如 Claude Code、ChatGPT 等），讓 AI 幫你完成所有設定。

```
請幫我在本機建置並執行 scam-guard 專案，我的電腦沒有 Node.js 環境，請從頭開始設定。

步驟：

1. 檢查是否已安裝 Node.js（需 v18 以上）：
   node -v
   如果沒有安裝或版本太低，請安裝 Node.js：
   - macOS：brew install node
   - Windows：請到 https://nodejs.org 下載 LTS 版本安裝

2. Clone 專案：
   git clone https://github.com/cj654eji6/scam-guard.git
   cd scam-guard

3. 安裝依賴套件：
   npm install

4. 建立環境變數檔案 .env，內容如下：
   ANTHROPIC_API_KEY=（請向專案負責人索取）
   LIFF_ID=2009444571-MZnNrudg

5. 啟動開發伺服器：
   npm run dev

6. 開啟瀏覽器前往 http://localhost:3000 即可使用

注意事項：
- ANTHROPIC_API_KEY 是必要的，沒有的話 AI 分析功能會無法使用
- 如果遇到 port 3000 被佔用，可以改用：npx nuxt dev --port 3001
- Windows 用戶如果遇到權限問題，請用系統管理員身份開啟終端機
```

## 手動建置

```bash
# 安裝依賴
npm install

# 建立 .env 檔案
cp .env.example .env
# 編輯 .env 填入 ANTHROPIC_API_KEY

# 啟動開發伺服器
npm run dev
```

## 環境變數

| 變數名稱 | 說明 | 必要 |
|---------|------|------|
| `ANTHROPIC_API_KEY` | Claude API 金鑰 | 是 |
| `LIFF_ID` | LINE LIFF App ID | 是（已有預設值） |
