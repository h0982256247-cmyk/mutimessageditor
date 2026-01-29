// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
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

Deno.serve(async (req) => {
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
            throw new Error('未授權使用者');
        }

        console.log(`User ${user.id} starting publish process`);

        // 取得使用者的 LINE Channel Access Token
        const { data: channelData, error: channelError } = await supabaseClient
            .from('rm_line_channels')
            .select('access_token_encrypted')
            .eq('user_id', user.id)
            .limit(1)
            .single();

        if (channelError) {
            console.error('Database error fetching channel:', channelError);
            throw new Error(`資料庫讀取錯誤: ${channelError.message}`);
        }

        if (!channelData) {
            throw new Error('找不到 LINE Channel 設定，請先在首頁綁定 Channel');
        }

        // 注意: 這裡假設 access_token_encrypted 已經在 DB 端解密
        const accessToken = channelData.access_token_encrypted;

        if (!accessToken) {
            throw new Error('Channel Access Token 為空');
        }

        // 解析請求
        let requestBody;
        try {
            requestBody = await req.json();
        } catch (e) {
            throw new Error('無法解析請求內容 (Invalid JSON)');
        }

        const { menus }: PublishRequest = requestBody;

        if (!menus || menus.length === 0) {
            throw new Error('沒有選單資料可發布');
        }

        console.log(`Processing ${menus.length} menus`);

        const results = [];
        let mainMenuId = '';

        // 1. 先刪除現有的所有 Rich Menu (可選)
        // 這樣可以避免累積過多舊選單
        try {
            console.log('Fetching old rich menus...');
            const listResponse = await fetch('https://api.line.me/v2/bot/richmenu/list', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            if (listResponse.ok) {
                const { richmenus } = await listResponse.json();
                console.log(`Found ${richmenus?.length || 0} old menus. Deleting...`);
                for (const menu of richmenus || []) {
                    await fetch(`https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                        },
                    });
                }
            } else {
                const errText = await listResponse.text();
                console.warn('Failed to list old menus:', errText);
            }
        } catch (err) {
            console.warn('清理舊選單失敗:', err);
        }

        // 2. 建立所有選單
        for (const [index, menu] of menus.entries()) {
            console.log(`Creating menu ${index + 1}/${menus.length}: ${menu.aliasId}`);

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
                console.error(`LINE API Create Error: ${errorText}`);
                throw new Error(`建立選單失敗 (LINE API): ${errorText}`);
            }

            const { richMenuId }: LineRichMenuResponse = await createResponse.json();
            console.log(`Created rich menu ID: ${richMenuId}`);

            // 上傳圖片
            if (menu.imageBase64) {
                console.log(`Uploading image for ${richMenuId}...`);
                // 處理 Base64 圖片
                // 支援 data:image/png;base64,... 格式或純 base64
                const base64Data = menu.imageBase64.includes(',')
                    ? menu.imageBase64.split(',')[1]
                    : menu.imageBase64;

                // Decode base64 string
                const binaryString = atob(base64Data);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                const uploadResponse = await fetch(
                    `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'image/png',
                        },
                        body: bytes,
                    }
                );

                if (!uploadResponse.ok) {
                    const errorText = await uploadResponse.text();
                    console.error(`LINE API Image Upload Error: ${errorText}`);
                    throw new Error(`上傳圖片失敗 (LINE API): ${errorText}`);
                }
            }

            // 設定 Rich Menu Alias
            console.log(`Setting alias ${menu.aliasId}...`);
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
            if (!aliasResponse.ok) {
                const aliasErr = await aliasResponse.text();
                console.warn(`Set alias result: ${aliasResponse.status} - ${aliasErr}`);
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
            console.log(`Setting default menu: ${mainMenuId}`);
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
    } catch (error: any) {
        console.error('Function execution error:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message || 'Unknown error occurred',
                stack: error.stack,
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );
    }
});
