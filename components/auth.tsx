'use client';
import { useState } from 'react';
import { Mountain } from 'lucide-react';
import { supabase } from '../lib/supabase';
export default function Auth() {
  const [signup, setSignup] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setMessage('');
    try {
      const { error } = signup
        ? await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (signup) setMessage('Revisa tu correo para confirmar la cuenta. Después podrás entrar.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'No se pudo iniciar sesión.'); }
    finally { setBusy(false); }
  }
  return <main><header><div className="mark"><Mountain /></div><div><small>TRAIL RUNNING TEAM</small><h1>Bestias de montaña</h1><p>#MountainBeastsTeam</p></div></header><section className="hero"><span className="eyebrow">TU MANADA, EN UN SOLO LUGAR</span><h2>{signup ? 'Únete a las Bestias' : 'Nos vemos arriba'}</h2><p className="copy">Entrenamientos, rutas y comunidad.</p><form className="form" onSubmit={submit}>
    {signup && <label>Tu nombre<input autoComplete="name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>}
    <label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Contraseña<input type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></label>
    <button disabled={busy} className="primary">{busy ? 'Un momento…' : signup ? 'Crear cuenta' : 'Entrar'}</button>
  </form><p role="status">{message}</p><button className="secondary" disabled={busy} onClick={() => { setSignup(!signup); setMessage(''); }}>{signup ? 'Ya tengo cuenta' : 'Crear una cuenta'}</button></section></main>;
}
