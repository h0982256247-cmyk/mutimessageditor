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

        const token = authHeader.replace('Bearer ', '');

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

        // 驗證使用者 (Explicitly pass token)
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser(token);

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

        // ========== Step 1.5: 清理舊選單 (Full Wipe 若 cleanOldMenus 為 true) ==========
        if (cleanOldMenus) {
            console.log('Cleaning up ALL old menus and aliases...');
            await updateJobProgress('clean_old_menus');

            try {
                // 1. 解除全域預設選單 (Unlink Default Rich Menu)
                // 這樣才能刪除被設為 Default 的選單
                await fetch('https://api.line.me/v2/bot/user/all/richmenu', {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                // 2. 取得現有所有 Alias 並刪除
                const aliasListRes = await fetch('https://api.line.me/v2/bot/richmenu/alias/list', {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                if (aliasListRes.ok) {
                    const { aliases } = await aliasListRes.json();
                    for (const alias of aliases) {
                        await fetch(`https://api.line.me/v2/bot/richmenu/alias/${alias.richMenuAliasId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                    }
                }

                // 3. 取得所有 Rich Menu 並刪除
                const menuListRes = await fetch('https://api.line.me/v2/bot/richmenu/list', {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });

                if (menuListRes.ok) {
                    const { richmenus } = await menuListRes.json();
                    for (const menu of richmenus) {
                        console.log(`Deleting rich menu: ${menu.richMenuId}`);
                        await fetch(`https://api.line.me/v2/bot/richmenu/${menu.richMenuId}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                    }
                }
            } catch (e) {
                console.warn('Error during cleanup (non-fatal):', e);
            }
        }

        // ========== Step 2: 建立所有選單 ==========
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

                    let imageBytes: Uint8Array;

                    if (menu.imageBase64.startsWith('http')) {
                        // Handle URL (from Supabase Storage)
                        console.log('Downloading image from URL...');
                        const imgRes = await fetch(menu.imageBase64);
                        if (!imgRes.ok) throw new Error(`Failed to download image from URL: ${menu.imageBase64}`);
                        const buffer = await imgRes.arrayBuffer();
                        imageBytes = new Uint8Array(buffer);
                    } else {
                        // Handle Base64
                        const base64Data = menu.imageBase64.includes(',')
                            ? menu.imageBase64.split(',')[1]
                            : menu.imageBase64;

                        const binaryString = atob(base64Data);
                        const len = binaryString.length;
                        imageBytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                            imageBytes[i] = binaryString.charCodeAt(i);
                        }
                    }

                    const uploadResponse = await fetch(
                        `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'image/png',
                            },
                            body: imageBytes,
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
                        console.error(`Create alias failed: ${createAliasResponse.status} - ${createErr}`);
                        progress[index].status = 'failed';
                        progress[index].error = `Alias 創建失敗: ${createErr}`;
                        await updateJobProgress('set_alias');
                        throw new Error(`建立別名失敗 (LINE API): ${createErr}`);
                    } else {
                        console.log(`Alias ${menu.aliasId} created successfully.`);
                    }
                } else {
                    const updateErr = await updateAliasResponse.text();
                    console.error(`Update alias failed: ${updateAliasResponse.status} - ${updateErr}`);
                    progress[index].status = 'failed';
                    progress[index].error = `Alias 更新失敗: ${updateErr}`;
                    await updateJobProgress('set_alias');
                    throw new Error(`更新別名失敗 (LINE API): ${updateErr}`);
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
