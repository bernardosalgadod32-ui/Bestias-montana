'use client';
import { useState } from 'react';
import { Mountain } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { authErrorMessage } from '../lib/auth-flow';

type Mode = 'signin' | 'signup' | 'recover' | 'resend';
export default function Auth({ initialMessage = '', onAuthenticated }: { initialMessage?: string; onAuthenticated?: () => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(initialMessage);
  const signup = mode === 'signup', emailOnly = mode === 'recover' || mode === 'resend';
  const titles = { signin: 'Nos vemos arriba', signup: 'Únete a las Bestias', recover: 'Recupera tu acceso', resend: 'Confirma tu correo' };
  const buttons = { signin: 'Entrar', signup: 'Crear cuenta', recover: 'Enviar enlace de recuperación', resend: 'Reenviar confirmación' };

  function changeMode(next: Mode) { setMode(next); setMessage(''); setPassword(''); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || busy) return;
    if (signup && !name.trim()) { setMessage('Escribe tu nombre.'); return; }
    setBusy(true); setMessage('');
    try {
      const address = email.trim(), redirectTo = window.location.origin;
      if (mode === 'recover') {
        const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo });
        if (error) throw error;
        setMessage('Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña. Revisa también tu carpeta de spam.');
      } else if (mode === 'resend') {
        const { error } = await supabase.auth.resend({ type: 'signup', email: address, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMessage('Si tu cuenta está pendiente de confirmar, recibirás otro correo. Revisa también tu carpeta de spam.');
      } else {
        const { data, error } = signup
          ? await supabase.auth.signUp({ email: address, password, options: { data: { display_name: name.trim() }, emailRedirectTo: redirectTo } })
          : await supabase.auth.signInWithPassword({ email: address, password });
        if (error) throw error;
        setPassword('');
        if (data.session) onAuthenticated?.();
        if (signup && !data.session) setMessage('Revisa tu correo para confirmar la cuenta. Después podrás entrar.');
      }
    } catch (e) { setMessage(authErrorMessage(e)); }
    finally { setBusy(false); }
  }
  return <main><header><div className="mark"><Mountain /></div><div><small>TRAIL RUNNING TEAM</small><h1>Bestias de montaña</h1><p>#MountainBeastsTeam</p></div></header><section className="hero"><span className="eyebrow">TU MANADA, EN UN SOLO LUGAR</span><h2>{titles[mode]}</h2><p className="copy">{emailOnly ? 'Te enviaremos un enlace a tu correo.' : 'Entrenamientos, rutas y comunidad.'}</p><form className="form" onSubmit={submit}>
    {signup && <label>Tu nombre<input autoComplete="name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>}
    <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    {!emailOnly && <label>Contraseña<input type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} /></label>}
    <button disabled={busy} className="primary">{busy ? 'Un momento…' : buttons[mode]}</button>
  </form><p role="status">{message}</p>
  {mode === 'signin' && <><button className="secondary" disabled={busy} onClick={() => changeMode('signup')}>Crear una cuenta</button><button className="secondary" disabled={busy} onClick={() => changeMode('recover')}>Olvidé mi contraseña</button></>}
  {mode !== 'signin' && <button className="secondary" disabled={busy} onClick={() => changeMode('signin')}>Volver a iniciar sesión</button>}
  {mode !== 'resend' && <button className="secondary" disabled={busy} onClick={() => changeMode('resend')}>Reenviar correo de confirmación</button>}
  </section></main>;
}
