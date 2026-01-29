-- LINE Rich Menu Editor - Supabase Database Schema
-- 請在您的 Supabase SQL Editor 中執行此腳本

-- 1. 建立 LINE Channels 資料表
CREATE TABLE IF NOT EXISTS public.rm_line_channels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2. 啟用 Row Level Security (RLS)
ALTER TABLE public.rm_line_channels ENABLE ROW LEVEL SECURITY;

-- 3. 建立 RLS 政策 - 使用者只能存取自己的 channel
CREATE POLICY "Users can view their own channels"
    ON public.rm_line_channels
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own channels"
    ON public.rm_line_channels
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own channels"
    ON public.rm_line_channels
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own channels"
    ON public.rm_line_channels
    FOR DELETE
    USING (auth.uid() = user_id);

-- 4. 建立 RPC 函數用於儲存加密的 Channel Access Token
-- 注意: 這個簡化版本直接儲存 token,實際生產環境應使用 pgcrypto 加密
CREATE OR REPLACE FUNCTION public.rm_channel_upsert(
    p_name TEXT,
    p_access_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_channel_id UUID;
BEGIN
    -- 檢查是否已存在
    SELECT id INTO v_channel_id
    FROM public.rm_line_channels
    WHERE user_id = auth.uid();

    IF v_channel_id IS NOT NULL THEN
        -- 更新現有記錄
        UPDATE public.rm_line_channels
        SET 
            name = p_name,
            access_token_encrypted = p_access_token,
            updated_at = NOW()
        WHERE id = v_channel_id;
    ELSE
        -- 插入新記錄
        INSERT INTO public.rm_line_channels (user_id, name, access_token_encrypted)
        VALUES (auth.uid(), p_name, p_access_token)
        RETURNING id INTO v_channel_id;
    END IF;

    RETURN v_channel_id;
END;
$$;

-- 5. (可選) 建立草稿儲存資料表
CREATE TABLE IF NOT EXISTS public.rm_drafts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data JSONB NOT NULL,
    status TEXT DEFAULT 'draft',
    folder_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rm_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own drafts"
    ON public.rm_drafts
    FOR ALL
    USING (auth.uid() = user_id);

-- 完成!
