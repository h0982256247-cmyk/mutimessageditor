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
        menuName?: string;
    }>;
    draftId?: string;
    cleanOldMenus?: boolean;
}

interface LineRichMenuResponse {
    richMenuId: string;
}

interface ProgressItem {
    aliasId: string;
    step: string;
    status: 'pending' | 'success' | 'failed';
    richMenuId?: string;
    error?: string;
}

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    let jobId: string | null = null;
    let supabaseClient: any = null;

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            console.error('Missing Authorization header');
            throw new Error('Missing Authorization header');
        }

        console.log(`Auth Header received: ${authHeader.substring(0, 20)}...`);
        console.log(`Env Check - URL: ${!!Deno.env.get('SUPABASE_URL')}, Anon Key: ${!!Deno.env.get('SUPABASE_ANON_KEY')}`);

        // 建立 Supabase client
        supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: authHeader },
                },
            }
        );

        // 驗證使用者
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError) {
            console.error('Auth error:', authError);
            throw new Error(`Authentication failed: ${authError.message}`);
        }

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

        const { menus, draftId, cleanOldMenus = false }: PublishRequest = requestBody;

        if (!menus || menus.length === 0) {
            throw new Error('沒有選單資料可發布');
        }

        console.log(`Processing ${menus.length} menus`);

        // ========== Step 1: 建立發布任務 (Job) ==========
        const initialProgress: ProgressItem[] = menus.map(m => ({
            aliasId: m.aliasId,
            step: 'pending',
            status: 'pending'
        }));

        const { data: jobData, error: jobError } = await supabaseClient
            .from('rm_publish_jobs')
            .insert({
                user_id: user.id,
                draft_id: draftId || null,
                status: 'publishing',
                current_step: 'create_menu',
                progress: initialProgress
            })
            .select()
            .single();

        if (jobError) {
            console.warn('Failed to create job record:', jobError);
        } else {
            jobId = jobData.id;
            console.log(`Created job: ${jobId}`);
        }

        const results = [];
        let mainMenuId = '';
        const progress: ProgressItem[] = [...initialProgress];

        // Helper: 更新 Job 進度
        const updateJobProgress = async (currentStep: string) => {
            if (!jobId) return;
            await supabaseClient
                .from('rm_publish_jobs')
                .update({
                    current_step: currentStep,
                    progress,
                    updated_at: new Date().toISOString()
                })
                .eq('id', jobId);
        };

        // ========== Step 2: 建立所有選單 (不再刪除舊選單) ==========
        for (const [index, menu] of menus.entries()) {
            console.log(`Creating menu ${index + 1}/${menus.length}: ${menu.aliasId}`);
            progress[index].step = 'create_menu';

            try {
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
                    progress[index].status = 'failed';
                    progress[index].error = errorText;
                    await updateJobProgress('create_menu');
                    throw new Error(`建立選單失敗 (LINE API): ${errorText}`);
                }

                const { richMenuId }: LineRichMenuResponse = await createResponse.json();
                console.log(`Created rich menu ID: ${richMenuId}`);
                progress[index].richMenuId = richMenuId;

                // ========== Step 3: 上傳圖片 ==========
                if (menu.imageBase64) {
                    progress[index].step = 'upload_image';
                    await updateJobProgress('upload_image');

                    console.log(`Uploading image for ${richMenuId}...`);
                    const base64Data = menu.imageBase64.includes(',')
                        ? menu.imageBase64.split(',')[1]
                        : menu.imageBase64;

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
                        progress[index].status = 'failed';
                        progress[index].error = errorText;
                        await updateJobProgress('upload_image');
                        throw new Error(`上傳圖片失敗 (LINE API): ${errorText}`);
                    }
                }

                // ========== Step 4: 設定 Alias (智慧判斷) ==========
                progress[index].step = 'set_alias';
                await updateJobProgress('set_alias');

                console.log(`Setting alias ${menu.aliasId}...`);

                // 先將舊版本標記為 inactive
                await supabaseClient
                    .from('rm_rich_menu_versions')
                    .update({ is_active: false })
                    .eq('user_id', user.id)
                    .eq('alias_id', menu.aliasId);

                // 先嘗試更新現有 Alias
                const updateAliasResponse = await fetch(
                    `https://api.line.me/v2/bot/richmenu/alias/${menu.aliasId}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ richMenuId }),
                    }
                );

                if (updateAliasResponse.ok) {
                    console.log(`Alias ${menu.aliasId} updated successfully.`);
                } else if (updateAliasResponse.status === 404) {
                    console.log(`Alias ${menu.aliasId} not found, creating new...`);
                    const createAliasResponse = await fetch(
                        'https://api.line.me/v2/bot/richmenu/alias',
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                richMenuAliasId: menu.aliasId,
                                richMenuId
                            }),
                        }
                    );

                    if (!createAliasResponse.ok) {
                        const createErr = await createAliasResponse.text();
                        console.warn(`Create alias failed: ${createAliasResponse.status} - ${createErr}`);
                    } else {
                        console.log(`Alias ${menu.aliasId} created successfully.`);
                    }
                } else {
                    const updateErr = await updateAliasResponse.text();
                    console.warn(`Update alias warning: ${updateAliasResponse.status} - ${updateErr}`);
                }

                // ========== Step 6: 儲存版本歷史 ==========
                await supabaseClient
                    .from('rm_rich_menu_versions')
                    .insert({
                        user_id: user.id,
                        draft_id: draftId || null,
                        job_id: jobId,
                        alias_id: menu.aliasId,
                        rich_menu_id: richMenuId,
                        menu_name: menu.menuName || menu.menuData?.name || 'Unknown',
                        is_main: menu.isMain,
                        is_active: true
                    });

                progress[index].status = 'success';
                results.push({
                    aliasId: menu.aliasId,
                    richMenuId,
                    isMain: menu.isMain,
                });

                if (menu.isMain) {
                    mainMenuId = richMenuId;
                }

            } catch (menuError: any) {
                progress[index].status = 'failed';
                progress[index].error = menuError.message;
                await updateJobProgress(progress[index].step);
                throw menuError;
            }
        }

        // ========== Step 5: 設定預設選單 ==========
        if (mainMenuId) {
            await updateJobProgress('set_default');
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

        // ========== 完成：更新 Job 狀態 ==========
        if (jobId) {
            await supabaseClient
                .from('rm_publish_jobs')
                .update({
                    status: 'completed',
                    current_step: 'done',
                    progress,
                    updated_at: new Date().toISOString()
                })
                .eq('id', jobId);
        }

        return new Response(
            JSON.stringify({
                success: true,
                jobId,
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

        // 更新 Job 為失敗狀態
        if (jobId && supabaseClient) {
            await supabaseClient
                .from('rm_publish_jobs')
                .update({
                    status: 'failed',
                    error_message: error.message,
                    updated_at: new Date().toISOString()
                })
                .eq('id', jobId);
        }

        return new Response(
            JSON.stringify({
                success: false,
                jobId,
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
