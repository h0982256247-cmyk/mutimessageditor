<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# LINE 多層圖文選單編輯器（Vite + React + Supabase）

此專案已加入：
- Supabase Email Auth（登入/註冊）
- 登入後填寫 LINE Channel access token（透過 RPC `rm_channel_upsert` 寫入並在 DB 端加密保存）

> 注意：不要把 LINE Channel access token 放在前端環境變數（VITE_*）或 Zeabur variables（會被打包到前端）。

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy env example:
   `cp .env.example .env.local`
3. Fill these values in `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Run:
   `npm run dev`

## Deploy on Zeabur

### 前置準備

#### 1. 設定 Supabase 資料庫

在 Supabase Dashboard 的 SQL Editor 中執行 `supabase/schema.sql`:

```sql
-- 建立資料表和 RPC 函數
-- 請參考 supabase/schema.sql 檔案
```

#### 2. 部署 Supabase Edge Function

```bash
# 安裝 Supabase CLI (如果尚未安裝)
npm install -g supabase

# 登入 Supabase
supabase login

# 連結到您的專案
supabase link --project-ref your-project-ref

# 部署 Edge Function
supabase functions deploy publish-richmenu
```

#### 3. 在 Zeabur 部署前端

1. 在 [Zeabur](https://zeabur.com) 建立新專案
2. 連接您的 GitHub repository: `https://github.com/h0982256247-cmyk/mutimessageditor`
3. 設定環境變數:
   - `VITE_SUPABASE_URL`: 您的 Supabase 專案 URL
   - `VITE_SUPABASE_ANON_KEY`: 您的 Supabase Anon Key
4. Zeabur 會自動偵測 Vite 專案並開始建置
5. 部署完成後,您會獲得一個公開 URL

### 驗證部署

1. 開啟部署的 URL
2. 註冊/登入帳號
3. 填寫 LINE Channel Access Token (從 [LINE Developers Console](https://developers.line.biz/) 取得)
4. 建立圖文選單並測試發布功能

### 取得 LINE Channel Access Token

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 選擇您的 Provider 和 Channel
3. 在 "Messaging API" 分頁中找到 "Channel access token"
4. 點擊 "Issue" 產生 token
5. 複製 token 並在編輯器中填寫

### 注意事項

> ⚠️ **重要**: Channel Access Token 會透過 Supabase RPC 加密儲存在資料庫中,不會暴露在前端程式碼或環境變數中。

> 💡 **提示**: 發布後的圖文選單會立即套用到您的 LINE Official Account,建議先在測試帳號上驗證。

