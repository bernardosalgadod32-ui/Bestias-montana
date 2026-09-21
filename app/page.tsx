'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import Auth from '../components/auth';
import Dashboard from '../components/dashboard';
export default function Page() {
  const [session, setSession] = useState<Session | null>(null), [ready, setReady] = useState(false);
  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    const { data } = supabase.auth.onAuthStateChange((_event, value) => { setSession(value); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  if (!supabase) return <main><h1>Bestias de montaña</h1><p className="copy">Estamos preparando la conexión con el equipo. Vuelve pronto.</p></main>;
  if (!ready) return <main><p role="status">Cargando tu manada…</p></main>;
  return session ? <Dashboard key={session.user.id} userId={session.user.id} /> : <Auth />;
}
