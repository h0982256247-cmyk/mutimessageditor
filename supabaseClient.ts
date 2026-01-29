import { createClient } from '@supabase/supabase-js';

// Vite 會把 VITE_* 變數注入到 import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // 這個錯誤會在開發/部署時提醒你 Zeabur variables 沒有設好
  // 注意：不要把 LINE Channel access token 放在 VITE_ 變數裡（會被打包到前端）
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(
  supabaseUrl ?? '',
  supabaseAnonKey ?? '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
