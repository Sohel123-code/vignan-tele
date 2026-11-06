import {createClient} from '@supabase/supabase-js';

const env = import.meta.env || {};
const url = env.VITE_SUPABASE_URL?.trim();
const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
export const isAdmin = user => user?.app_metadata?.role === 'admin';

function makeClient() {
  if (!url || !key || url.includes('your-project') || key.includes('your_key_here')) return null;
  try {
    if (!/^https?:$/.test(new URL(url).protocol)) return null;
    if (key.startsWith('sb_secret_')) return null;
    if (key.split('.').length === 3) {
      const role = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role;
      if (role !== 'anon') return null;
    }
    return createClient(url, key, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}});
  } catch { return null; }
}
export const supabase = makeClient();
