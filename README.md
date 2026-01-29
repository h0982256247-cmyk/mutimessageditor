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

在 Zeabur 的 Variables 加入：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

然後用 `npm run build` 產出靜態檔即可部署。
