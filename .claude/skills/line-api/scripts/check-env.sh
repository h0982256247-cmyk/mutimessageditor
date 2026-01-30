#!/bin/bash

# LINE API 環境檢查腳本

echo "🔍 檢查 LINE API 開發環境..."
echo ""

# 檢查 Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js: $(node -v)"
else
    echo "❌ Node.js 未安裝"
    echo "   請安裝 Node.js 18+: https://nodejs.org/"
fi

# 檢查 npm
if command -v npm &> /dev/null; then
    echo "✅ npm: $(npm -v)"
else
    echo "❌ npm 未安裝"
fi

# 檢查環境變數
echo ""
echo "📋 環境變數檢查："

if [ -n "$LINE_CHANNEL_ACCESS_TOKEN" ]; then
    echo "✅ LINE_CHANNEL_ACCESS_TOKEN 已設定"
else
    echo "⚠️  LINE_CHANNEL_ACCESS_TOKEN 未設定"
fi

if [ -n "$LINE_CHANNEL_SECRET" ]; then
    echo "✅ LINE_CHANNEL_SECRET 已設定"
else
    echo "⚠️  LINE_CHANNEL_SECRET 未設定"
fi

if [ -n "$LINE_CHANNEL_ID" ]; then
    echo "✅ LINE_CHANNEL_ID 已設定"
else
    echo "⚠️  LINE_CHANNEL_ID 未設定"
fi

if [ -n "$NEXT_PUBLIC_LIFF_ID" ]; then
    echo "✅ NEXT_PUBLIC_LIFF_ID 已設定"
else
    echo "⚠️  NEXT_PUBLIC_LIFF_ID 未設定"
fi

# 檢查常用套件
echo ""
echo "📦 已安裝的相關套件："

if [ -f "package.json" ]; then
    if grep -q "@line/bot-sdk" package.json 2>/dev/null; then
        echo "✅ @line/bot-sdk"
    else
        echo "⚠️  @line/bot-sdk 未安裝 (npm install @line/bot-sdk)"
    fi
    
    if grep -q "@line/liff" package.json 2>/dev/null; then
        echo "✅ @line/liff"
    else
        echo "⚠️  @line/liff 未安裝 (npm install @line/liff)"
    fi
    
    if grep -q "next-auth" package.json 2>/dev/null; then
        echo "✅ next-auth"
    else
        echo "ℹ️  next-auth 未安裝（如需 LINE Login 可安裝）"
    fi
else
    echo "ℹ️  找不到 package.json（不在專案目錄中）"
fi

echo ""
echo "🎉 環境檢查完成！"
