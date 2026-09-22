import { createClient } from '@supabase/supabase-js';
import { readAuthLink, writeRecoveryUser } from './auth-flow';

// This app fetches private data in the browser. Every operation is authorized by RLS.
// Never put a service-role key or database password here.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// Capture the recovery intent before the SDK consumes and removes the URL fragment.
export const initialAuthLink = typeof window === 'undefined'
  ? { recovery: false, callback: false, error: '' }
  : readAuthLink(window.location.href);
if (initialAuthLink.recovery) writeRecoveryUser('pending');
export const supabase = url && key ? createClient(url, key) : null;
