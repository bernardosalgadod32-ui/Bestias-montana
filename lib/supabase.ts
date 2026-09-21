import { createClient } from '@supabase/supabase-js';

// This app fetches private data in the browser. Every operation is authorized by RLS.
// Never put a service-role key or database password here.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
