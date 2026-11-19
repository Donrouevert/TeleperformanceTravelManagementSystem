import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url?.startsWith('https://') && key && !key.includes('your-') ? createClient(url, key) : null;
export const cloudMode = Boolean(supabase);
