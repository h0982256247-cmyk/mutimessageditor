// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishRequest {
    menus: Array<{
        menuData: any;
        imageBase64: string | null;
        aliasId: string;
        isMain: boolean;
    }>;
}

interface LineRichMenuResponse {
    richMenuId: string;
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 建立 Supabase client
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: req.headers.get('Authorization')! },
                },
            }
        );

        // 驗證使用者
        const {
            data: { user },
        } = await supabaseClient.auth.getUser();

        if (!user) {
            throw new Error('未授權');
        }

        // 取得使用者的 LINE Channel Access Token
        const { data: channelData, error: channelError } = await supabaseClient
            .from('rm_line_channels')
            .select('access_token_encrypted')
            .eq('user_id', user.id)
            .limit(1)
            .single();

        if (channelError || !channelData) {
            throw new Error('找不到 LINE Channel 設定');
        }

        // 注意: 這裡假設 access_token_encrypted 已經在 DB 端解密
        // 如果您的 Supabase 設定使用 pgcrypto,需要用 RPC 來解密
        const accessToken = channelData.access_token_encrypted;

        // 解析請求
        const { menus }: PublishRequest = await req.json();

        if (!menus || menus.length === 0) {
            throw new Error('沒有選單資料');
        }

        const results = [];
        let mainMenuId = '';

        // 1. 先刪除現有的所有 Rich Menu (可選)
        // 這樣可以避免累積過多舊選單
        try {
            const listResponse = await fetch('https://api.line.me/v2/bot/richmenu/list', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            if (listResponse.ok) {
                const { richmenus } = await listResponse.json();
                for (const menu of richmenus || []) {
                    await fetch(`https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                        },
                    });
                }
            }
        } catch (err) {
            console.warn('清理舊選單失敗:', err);
        }

        // 2. 建立所有選單
        for (const menu of menus) {
            // 建立 Rich Menu
            const createResponse = await fetch('https://api.line.me/v2/bot/richmenu', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(menu.menuData),
            });

            if (!createResponse.ok) {
                const errorText = await createResponse.text();
                throw new Error(`建立選單失敗: ${errorText}`);
            }

            const { richMenuId }: LineRichMenuResponse = await createResponse.json();

            // 上傳圖片
            if (menu.imageBase64) {
                const base64Data = menu.imageBase64.split(',')[1] || menu.imageBase64;
                const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

                const uploadResponse = await fetch(
                    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'image/png',
                        },
                        body: imageBuffer,
                    }
                );

                if (!uploadResponse.ok) {
                    const errorText = await uploadResponse.text();
                    throw new Error(`上傳圖片失敗: ${errorText}`);
                }
            }

            // 設定 Rich Menu Alias
            const aliasResponse = await fetch(
                `https://api.line.me/v2/bot/richmenu/alias/${menu.aliasId}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ richMenuId }),
                }
            );

            // Alias 可能已存在,不算錯誤
            if (!aliasResponse.ok && aliasResponse.status !== 400) {
                console.warn(`設定 alias 失敗: ${await aliasResponse.text()}`);
            }

            results.push({
                aliasId: menu.aliasId,
                richMenuId,
                isMain: menu.isMain,
            });

            if (menu.isMain) {
                mainMenuId = richMenuId;
            }
        }

        // 3. 設定主選單為預設選單
        if (mainMenuId) {
            const setDefaultResponse = await fetch(
                `https://api.line.me/v2/bot/user/all/richmenu/${mainMenuId}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            if (!setDefaultResponse.ok) {
                const errorText = await setDefaultResponse.text();
                console.warn(`設定預設選單失敗: ${errorText}`);
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                results,
                mainMenuId,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );
    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            }
        );
    }
});
