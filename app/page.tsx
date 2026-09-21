'use client';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { initialAuthLink, supabase } from '../lib/supabase';
import { authErrorMessage, cleanAuthUrl, readRecoveryUser, recoveryUserAfterEvent, writeRecoveryUser } from '../lib/auth-flow';
import Auth from '../components/auth';
import Dashboard from '../components/dashboard';
import PasswordRecovery from '../components/password-recovery';

export default function Page() {
  const [session, setSession] = useState<Session | null>(null), [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false), [linkError, setLinkError] = useState(initialAuthLink.error), [notice, setNotice] = useState('');
  const recoveryUser = useRef<string | null>(null);
  function rememberRecovery(userId: string | null) {
    recoveryUser.current = userId; writeRecoveryUser(userId); setRecovery(Boolean(userId));
  }
  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    const client = supabase;
    let active = true;
    recoveryUser.current = readRecoveryUser();
    const { data } = client.auth.onAuthStateChange((event, value) => {
      if (!active) return;
      setSession(value);
      rememberRecovery(recoveryUserAfterEvent(event, recoveryUser.current, value?.user.id ?? null));
      if (event === 'SIGNED_OUT') setNotice('');
    });
    void (async () => {
      const initialized = await client.auth.initialize();
      if (!active) return;
      if (initialAuthLink.callback) window.history.replaceState(window.history.state, '', cleanAuthUrl(window.location.href));
      if (initialized.error || initialAuthLink.error) {
        rememberRecovery(null);
        setLinkError(initialAuthLink.error || authErrorMessage(initialized.error));
        setReady(true); return;
      }
      const result = await client.auth.getSession();
      if (!active) return;
      if (result.error) setLinkError(authErrorMessage(result.error));
      const current = result.data.session;
      setSession(current);
      rememberRecovery(current && (initialAuthLink.recovery || recoveryUser.current === current.user.id || recoveryUser.current === 'pending') ? current.user.id : null);
      setReady(true);
    })().catch(error => {
      if (active) { setLinkError(authErrorMessage(error)); rememberRecovery(null); setReady(true); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  if (!supabase) return <main><h1>Bestias de montaña</h1><p className="copy">Estamos preparando la conexión con el equipo. Vuelve pronto.</p></main>;
  if (!ready) return <main><p role="status">Cargando tu manada…</p></main>;
  if (linkError || !session) return <Auth initialMessage={linkError} onAuthenticated={() => setLinkError('')} />;
  if (recovery) return <PasswordRecovery onComplete={() => { rememberRecovery(null); setNotice('Contraseña actualizada. Ya puedes continuar con tu equipo.'); }} />;
  return <>{notice && <p role="status" className="notice" style={{ maxWidth: 520, margin: '16px auto' }}>{notice}</p>}<Dashboard key={session.user.id} userId={session.user.id} /></>;
}
