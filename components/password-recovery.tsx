'use client';
import { useState } from 'react';
import { Mountain } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { authErrorMessage, passwordValidation } from '../lib/auth-flow';

export default function PasswordRecovery({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || busy) return;
    const validation = passwordValidation(password, confirmation);
    if (validation) { setMessage(validation); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(''); setConfirmation(''); onComplete();
    } catch (e) { setMessage(authErrorMessage(e)); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!supabase || busy) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (e) { setMessage(authErrorMessage(e)); }
    finally { setBusy(false); }
  }
  return <main><header><div className="mark"><Mountain /></div><div><small>BESTIAS DE MONTAÑA</small><h1>Recupera tu acceso</h1></div></header><section className="hero"><h2>Elige una nueva contraseña</h2><p className="copy">Usa al menos 8 caracteres. Guarda tu nueva contraseña para volver a entrar.</p><form className="form" onSubmit={submit}>
    <label>Nueva contraseña<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></label>
    <label>Repite la contraseña<input type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
    <button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar nueva contraseña'}</button>
  </form><p role="status">{message}</p><button className="secondary" disabled={busy} onClick={cancel}>Cancelar y cerrar sesión</button></section></main>;
}
