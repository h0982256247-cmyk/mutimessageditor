---
name: line-api
description: LINE API 開發技能集合 - 包含 Messaging API、Flex Message、LIFF、Login、Webhook
---

# LINE API Skills 索引

這是一套完整的 LINE API 開發技能集合，涵蓋 LINE 平台開發的各個面向。

## 包含的 Skills

| Skill | 說明 | 適用場景 |
|-------|------|----------|
| [line-messaging-api](./line-messaging-api/SKILL.md) | 發送訊息、推播、廣播 | 建立 LINE Bot |
| [line-flex-message](./line-flex-message/SKILL.md) | 建立豐富版面訊息 | 商品卡片、選單 |
| [line-liff](./line-liff/SKILL.md) | LINE 內嵌網頁應用 | 表單、互動功能 |
| [line-login](./line-login/SKILL.md) | 社群登入整合 | 網站會員系統 |
| [line-webhook](./line-webhook/SKILL.md) | 接收平台事件 | 自動回覆、事件處理 |
| [line-rich-menu](./line-rich-menu/SKILL.md) | 圖文選單、多層選單 | 選單設計、選單切換 |

---

## 快速開始

### 環境需求
- Node.js 18+
- TypeScript
- LINE Developers 帳號

### 必要環境變數
```bash
# Messaging API
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_CHANNEL_SECRET=your_channel_secret

# LINE Login
LINE_CHANNEL_ID=your_channel_id

# LIFF
NEXT_PUBLIC_LIFF_ID=your_liff_id
```

### 推薦專案結構
```
your-project/
├── app/
│   ├── api/
│   │   ├── webhook/
│   │   │   └── route.ts      # Webhook 處理
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts  # LINE Login
│   └── liff/
│       └── page.tsx          # LIFF 頁面
├── lib/
│   ├── line/
│   │   ├── messaging.ts      # Messaging API 封裝
│   │   ├── flex.ts           # Flex Message 建構
│   │   └── webhook.ts        # Webhook 處理邏輯
│   └── auth/
│       └── line.ts           # Login 相關
└── types/
    └── line.ts               # TypeScript 類型定義
```

---

## 典型開發流程

### 1. 建立 LINE Bot
1. 設定 Messaging API Channel
2. 設定 Webhook URL
3. 實作 Webhook 處理邏輯
4. 實作回覆/推播功能

### 2. 加入 Flex Message
1. 使用 Flex Message Simulator 設計版面
2. 建立 Flex Message 建構函式
3. 在回覆中使用 Flex Message

### 3. 加入 LIFF 功能
1. 建立 LIFF App
2. 實作 LIFF 頁面
3. 整合 shareTargetPicker

### 4. 加入 LINE Login
1. 建立 LINE Login Channel
2. 設定 OAuth Callback
3. 實作登入流程

---

## 相關連結

- [LINE Developers Console](https://developers.line.biz/console/)
- [LINE Developers 官方文件](https://developers.line.biz/en/docs/)
- [Flex Message Simulator](https://developers.line.biz/flex-simulator/)
- [LINE Bot SDK for Node.js](https://github.com/line/line-bot-sdk-nodejs)
