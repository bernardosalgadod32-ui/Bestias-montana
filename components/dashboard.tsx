'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Home, CalendarDays, Map, Users, User, Mountain, MapPin, Clock, Footprints, ChevronRight, Plus, ArrowLeft, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { allRows } from '../lib/pagination';
import { GPX_MIME_TYPE, gpxUploadBody, MAX_GPX_BYTES, parseGPX, routeStats, type Point } from '../lib/gpx';
import TeamMembers from './team-members';
import type { Attendance, Membership, Profile, RemovedMember, Role, Route, Team, Training } from '../lib/types';
const RouteMap = dynamic(() => import('./route-map'), { ssr: false, loading: () => <p>Cargando mapa…</p> });
const emptyForm = { title: '', starts_at: '', place: '', km: 0, gain: 0, duration: 90, level: 'Todos', description: '', gear: '' };
type Form = typeof emptyForm;
const messageOf = (e: unknown) => e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : 'No se pudo completar la operación. Inténtalo de nuevo.';
const fmt = (date: string, timezone: string) => new Date(date).toLocaleString('es-MX', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Dashboard({ userId }: { userId: string }) {
  const db = supabase!;
  const [teams, setTeams] = useState<Team[]>([]), [teamId, setTeamId] = useState('');
  const [members, setMembers] = useState<Membership[]>([]), [profiles, setProfiles] = useState<Profile[]>([]);
  const [removedMembers, setRemovedMembers] = useState<RemovedMember[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]), [attendance, setAttendance] = useState<Attendance[]>([]), [routes, setRoutes] = useState<Route[]>([]);
  const [tab, setTab] = useState('Inicio'), [selectedId, setSelectedId] = useState(''), [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm), [gpxFile, setGpxFile] = useState<File | null>(null), [preview, setPreview] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [invite, setInvite] = useState(''), [joinCode, setJoinCode] = useState(''), [teamName, setTeamName] = useState('Bestias de montaña'), [displayName, setDisplayName] = useState('');
  const [points, setPoints] = useState<Point[]>([]), [routeLoading, setRouteLoading] = useState(false), [routeError, setRouteError] = useState('');
  const requestVersion = useRef(0), mutation = useRef(false);
  const team = teams.find(t => t.id === teamId), timezone = team?.timezone || 'America/Mexico_City';
  const role = members.find(m => m.user_id === userId)?.role;
  const canCoach = role === 'admin' || role === 'coach';
  const selected = trainings.find(t => t.id === selectedId), selectedRoute = routes.find(r => r.training_id === selectedId);
  const next = trainings.find(t => new Date(t.starts_at).getTime() >= Date.now());

  const clearTeamData = useCallback(() => {
    setMembers([]); setProfiles([]); setRemovedMembers([]); setTrainings([]); setAttendance([]); setRoutes([]);
    setSelectedId(''); setEditing(null); setForm(emptyForm); setGpxFile(null); setPreview([]); setPoints([]); setInvite('');
    setRouteError(''); setRouteLoading(false);
  }, []);

  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    const [ts, me] = await Promise.all([allRows<Team>((from,to) => db.from('teams').select('*').order('created_at').order('id').range(from,to)), db.from('profiles').select('id,display_name').eq('id', userId).single()]);
    if (me.error) throw me.error;
    if (version !== requestVersion.current) return;
    setTeams(ts); setDisplayName(me.data.display_name);
    const activeId = ts.some(t => t.id === teamId) ? teamId : ts[0]?.id || '';
    if (activeId !== teamId) {
      clearTeamData();
      if (teamId && !ts.some(t => t.id === teamId)) setNotice('Ya no tienes acceso a ese equipo. Contacta a su administrador si necesitas volver.');
      setLoading(Boolean(activeId)); setTeamId(activeId); return;
    }
    if (!activeId) { clearTeamData(); setLoading(false); return; }
    const [ms, trainingRows, attendanceRows, routeRows] = await Promise.all([
      allRows<Membership>((from,to) => db.from('memberships').select('*').eq('team_id', activeId).order('user_id').range(from,to)),
      allRows<Training>((from,to) => db.from('trainings').select('*').eq('team_id', activeId).order('starts_at').order('id').range(from,to)),
      allRows<Attendance>((from,to) => db.from('attendance').select('*').eq('team_id', activeId).order('training_id').order('user_id').range(from,to)),
      allRows<Route>((from,to) => db.from('routes').select('*').eq('team_id', activeId).order('training_id').range(from,to)),
    ]);
    if (version !== requestVersion.current) return;
    if (!ms.some(member => member.user_id === userId)) {
      // Access may have changed between loading teams and loading their rows.
      const remainingTeams = ts.filter(item => item.id !== activeId), remainingId = remainingTeams[0]?.id || '';
      clearTeamData(); setTeams(remainingTeams); setTeamId(remainingId); setLoading(Boolean(remainingId));
      setNotice('Ya no tienes acceso a ese equipo. Contacta a su administrador si necesitas volver.');
      return;
    }
    const profileRows: Profile[] = [];
    for (let i = 0; i < ms.length; i += 100) {
      const ps = await db.from('profiles').select('id,display_name').in('id', ms.slice(i,i+100).map(m => m.user_id));
      if (ps.error) throw ps.error;
      profileRows.push(...ps.data);
    }
    let removedRows: RemovedMember[] = [];
    if (ms.find(member => member.user_id === userId)?.role === 'admin') {
      removedRows = await allRows<RemovedMember>((from, to) => db.rpc('list_removed_members', { t: activeId }).order('removed_at', { ascending: false }).order('user_id').range(from, to));
    }
    if (version !== requestVersion.current) return;
    setMembers(ms); setProfiles(profileRows); setRemovedMembers(removedRows); setTrainings(trainingRows); setAttendance(attendanceRows); setRoutes(routeRows); setLoading(false);
  }, [db, teamId, userId, clearTeamData]);
  useEffect(() => { setLoading(true); reload().catch(e => { setError(messageOf(e)); setLoading(false); }); return () => { requestVersion.current++; }; }, [reload]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || mutation.current) return;
      const check = async () => {
        // Preserve drafts, but still detect revoked membership while editing or on Profile.
        if (teamId && (editing !== null || tab === 'Perfil')) {
          const membership = await db.from('memberships').select('role').eq('team_id', teamId).eq('user_id', userId).maybeSingle();
          if (membership.error) throw membership.error;
          if (membership.data) return;
        }
        await reload();
      };
      check().catch(e => setError(messageOf(e)));
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); clearInterval(timer); };
  }, [db, reload, editing, tab, teamId, userId]);
  useEffect(() => {
    let canceled = false; setPoints([]); setRouteError('');
    if (!selectedRoute) { setRouteLoading(false); return; }
    setRouteLoading(true);
    db.storage.from('gpx').download(selectedRoute.path).then(async ({ data, error }) => {
      if (error) throw error;
      const p = parseGPX(await data.text()); if (!canceled) setPoints(p);
    }).catch(e => { if (!canceled) setRouteError(messageOf(e)); }).finally(() => { if (!canceled) setRouteLoading(false); });
    return () => { canceled = true; };
  }, [db, selectedRoute?.path]);

  async function run(action: () => Promise<void>, refresh = true) {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); if (refresh) await reload(); } catch (e) { setError(messageOf(e)); }
    finally { mutation.current = false; setBusy(false); }
  }
  const going = (id: string) => attendance.some(a => a.training_id === id && a.user_id === userId);
  const toggle = (t: Training) => run(async () => {
    const result = going(t.id)
      ? await db.from('attendance').delete().eq('training_id', t.id).eq('user_id', userId)
      : await db.from('attendance').insert({ training_id: t.id, team_id: t.team_id, user_id: userId });
    if (result.error) throw result.error;
  });
  function startEdit(t?: Training) {
    setError(''); setEditing(t?.id || 'new'); setGpxFile(null); setPreview([]);
    if (!t) { setForm(emptyForm); return; }
    const d = new Date(t.starts_at); const local = new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
    setForm({ title: t.title, starts_at: local, place: t.place, km: t.km, gain: t.gain, duration: t.duration, level: t.level, description: t.description, gear: t.gear });
  }
  async function saveTraining(e: React.FormEvent) {
    e.preventDefault(); await run(async () => {
      if (!canCoach) throw new Error('Necesitas permisos de coach.');
      const id = editing === 'new' ? crypto.randomUUID() : editing!;
      const values = { ...form, title: form.title.trim(), starts_at: new Date(form.starts_at).toISOString() };
      const result = editing === 'new' ? await db.from('trainings').insert({ ...values, id, team_id: teamId }).select('id').single() : await db.from('trainings').update(values).eq('id', id).eq('team_id', teamId).select('id').single();
      if (result.error) throw result.error;
      setEditing(id); // A failed upload can be retried without duplicating the training.
      if (gpxFile) {
        const path = `${teamId}/${id}/${crypto.randomUUID()}.gpx`;
        const upload = await db.storage.from('gpx').upload(path, gpxUploadBody(gpxFile), { contentType: GPX_MIME_TYPE, upsert: false });
        if (upload.error) throw new Error(`Entrenamiento guardado; la ruta no se subió: ${upload.error.message}`);
        const old = routes.find(r => r.training_id === id);
        const route = await db.from('routes').upsert({ training_id: id, team_id: teamId, path, filename: gpxFile.name.slice(0,200) });
        if (route.error) { await db.storage.from('gpx').remove([path]); throw new Error(`Entrenamiento guardado; no se vinculó el GPX: ${route.error.message}`); }
        if (old) { const cleanup = await db.storage.from('gpx').remove([old.path]); if (cleanup.error) setNotice('Ruta guardada. No se pudo limpiar el archivo anterior.'); }
      }
      setEditing(null); setSelectedId(id); setGpxFile(null); setNotice('Entrenamiento guardado.');
    });
  }
  async function deleteTraining(t: Training) {
    if (!window.confirm(`¿Eliminar «${t.title}» y sus confirmaciones?`)) return;
    await run(async () => {
      const route = routes.find(r => r.training_id === t.id);
      if (route) {
        const result = await db.storage.from('gpx').remove([route.path]); if (result.error) throw result.error;
        const removed = await db.from('routes').delete().eq('training_id', t.id); if (removed.error) throw removed.error;
      }
      const result = await db.from('trainings').delete().eq('id', t.id).select('id').single(); if (result.error) throw result.error;
      setSelectedId(''); setNotice('Entrenamiento eliminado.');
    });
  }
  const download = () => run(async () => {
    if (!selectedRoute) return;
    const { data, error } = await db.storage.from('gpx').download(selectedRoute.path); if (error) throw error;
    const url = URL.createObjectURL(data), a = document.createElement('a'); a.href = url; a.download = selectedRoute.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const join = (e: React.FormEvent) => { e.preventDefault(); void run(async () => { const { data, error } = await db.rpc('join_team', { code: joinCode.trim() }); if (error) throw error; if (data === teamId) await reload(); else { setLoading(true); setTeamId(data); } setJoinCode(''); setNotice('Ya eres parte del equipo.'); }, false); };
  const create = (e: React.FormEvent) => { e.preventDefault(); void run(async () => { const { data, error } = await db.rpc('create_team', { team_name: teamName }); if (error) throw error; setLoading(true); setTeamId(data); setNotice('Equipo creado. Eres su administrador.'); }, false); };
  const profileName = (id: string) => profiles.find(p => p.id === id)?.display_name || 'Bestia';
  const removeMember = (member: Membership) => {
    const name = profileName(member.user_id);
    if (!window.confirm(`¿Sacar a «${name}» de ${team?.name}? Perderá el acceso al equipo y sus confirmaciones de asistencia. Su cuenta se conserva, pero solo un administrador podrá readmitirlo.`)) return;
    void run(async () => {
      const result = await db.rpc('remove_team_member', { t: teamId, member_id: member.user_id });
      if (result.error) throw result.error;
      setNotice(`${name} ya no tiene acceso al equipo.`);
    });
  };
  const readmitMember = (member: RemovedMember) => { void run(async () => {
    const result = await db.rpc('readmit_team_member', { t: teamId, member_id: member.user_id });
    if (result.error) throw result.error;
    setNotice(`${member.display_name} vuelve al equipo como miembro.`);
  }); };
  const alerts = <>{error && <div role="alert" className="notice">{error}<button className="secondary" disabled={busy} onClick={() => run(async () => {})}>Volver a cargar</button></div>}{notice && <p role="status" className="notice">{notice}</p>}</>;
  const joinForm = <form className="form panel" onSubmit={join}><label>Código de invitación<input required value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Pídelo al administrador" /></label><button className="secondary" disabled={busy}>Unirme al equipo</button></form>;
  const createForm = <form className="form panel" onSubmit={create}><label>Nombre del equipo<input required maxLength={80} value={teamName} onChange={e => setTeamName(e.target.value)} /></label><button className="primary" disabled={busy}>Crear mi equipo</button></form>;
  if (loading) return <main>{alerts}<p role="status">Cargando equipo…</p></main>;
  if (!team) return <main><Mountain /><h1>Encuentra tu manada</h1>{alerts}<p className="copy">Usa una invitación para unirte o crea un equipo que administrarás.</p>{joinForm}{createForm}<button className="secondary" onClick={() => run(async () => { const r = await db.auth.signOut(); if(r.error) throw r.error; })}>Cerrar sesión</button></main>;

  if (editing !== null) return <main>{alerts}<button disabled={busy} className="back" onClick={() => setEditing(null)}><ArrowLeft />Cancelar</button><h1>{editing === 'new' ? 'Crear' : 'Editar'} entrenamiento</h1><form className="form" onSubmit={saveTraining}>
    <label>Nombre<input required maxLength={120} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
    <label>Fecha y hora · {Intl.DateTimeFormat().resolvedOptions().timeZone}<input required type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} /></label>
    <label>Punto de reunión<input maxLength={300} value={form.place} onChange={e => setForm({ ...form, place: e.target.value })} /></label>
    {(['km','gain','duration'] as const).map((key, i) => <label key={key}>{['Distancia (km)','Desnivel positivo (m)','Duración (min)'][i]}<input type="number" required min={key === 'duration' ? 1 : 0} max={key === 'km' ? 2000 : key === 'gain' ? 100000 : 10080} step={key === 'km' ? 0.1 : 1} value={form[key]} onChange={e => setForm({ ...form, [key]: Number(e.target.value) })} /></label>)}
    <label>Dificultad<select value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}>{['Todos','Principiante','Intermedio','Avanzado'].map(l => <option key={l}>{l}</option>)}</select></label>
    <label>Descripción<textarea maxLength={5000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label><label>Equipo recomendado<textarea maxLength={2000} value={form.gear} onChange={e => setForm({ ...form, gear: e.target.value })} /></label>
    <label className="upload">{routes.some(r => r.training_id === editing) ? 'Reemplazar GPX (opcional)' : 'Subir ruta GPX (opcional)'} · máximo 5 MB<input type="file" accept=".gpx,application/gpx+xml" disabled={busy} onChange={async e => { const input = e.currentTarget; const file = input.files?.[0]; setGpxFile(null); setPreview([]); if (!file) return; try { if (file.size > MAX_GPX_BYTES) throw new Error('El GPX supera 5 MB.'); const p = parseGPX(await file.text()); setPreview(p); setGpxFile(file); setForm(v => ({ ...v, ...routeStats(p) })); setError(''); } catch(err) { setError(messageOf(err)); input.value = ''; } }} /></label>
    {preview.length > 0 && <RouteMap points={preview} />}<button className="primary" disabled={busy || !canCoach}>{busy ? 'Guardando…' : 'Guardar entrenamiento'}</button>
  </form></main>;

  if (selected) return <main>{alerts}<button className="back" disabled={busy} onClick={() => setSelectedId('')}><ArrowLeft />Volver</button><div className="detail"><span className="eyebrow">{fmt(selected.starts_at, timezone)}</span><h1>{selected.title}</h1><p className="location"><MapPin />{selected.place}</p>{routeLoading ? <p>Cargando ruta…</p> : points.length > 0 ? <RouteMap points={points} /> : <div className="mapEmpty"><Map /><b>{routeError || 'Sin ruta GPX'}</b></div>}<Metrics t={selected} /><h3>Entrenamiento</h3><p className="copy">{selected.description || 'Sin descripción.'}</p><h3>Equipo recomendado</h3><p className="copy">{selected.gear || 'Consulta al coach.'}</p><button className="primary" disabled={busy} onClick={() => toggle(selected)}>{going(selected.id) ? '✓ Confirmado · cancelar asistencia' : 'Voy 🐾'}</button>{selectedRoute && <button className="secondary" disabled={busy} onClick={download}><Download />Descargar GPX</button>}<h3>Asistentes · {attendance.filter(a => a.training_id === selected.id).length}</h3><ul className="attendees">{attendance.filter(a => a.training_id === selected.id).map(a => <li key={a.user_id}>{profileName(a.user_id)}{a.user_id === userId ? ' (tú)' : ''}</li>)}</ul>{!attendance.some(a => a.training_id === selected.id) && <p className="muted">Sé la primera Bestia en confirmar.</p>}{canCoach && <><button disabled={busy} className="secondary" onClick={() => startEdit(selected)}>Editar entrenamiento</button><button disabled={busy} className="secondary" onClick={() => deleteTraining(selected)}>Eliminar entrenamiento</button></>}</div></main>;

  return <main><header><div className="mark"><Mountain /></div><div><small>TRAIL RUNNING TEAM</small><h1>{team.name}</h1><p>#MountainBeastsTeam</p></div>{canCoach && <button aria-label="Crear entrenamiento" className="gear" onClick={() => startEdit()}><Plus /></button>}</header>{alerts}
    {teams.length > 1 && <label className="team-picker">Equipo<select value={teamId} disabled={busy} onChange={e => { clearTeamData(); setTeamId(e.target.value); setLoading(true); }}>{teams.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>}
    <p className="timezone">Horarios: {timezone}</p>
    {tab === 'Inicio' && <>{next ? <section className="hero"><span className="eyebrow">PRÓXIMO ENTRENAMIENTO</span><h2>{next.title}</h2><div className="date">{fmt(next.starts_at, timezone)}</div><Metrics t={next} /><p className="location"><MapPin />{next.place}</p><button className="primary" disabled={busy} onClick={() => toggle(next)}>{going(next.id) ? '✓ Confirmado · cancelar' : 'Voy 🐾'}</button><button className="secondary" onClick={() => setSelectedId(next.id)}>Ver entrenamiento<ChevronRight /></button></section> : <Empty title="La próxima aventura está por llegar" text="Tu coach publicará aquí los próximos entrenamientos." />}<h3>La agenda de las Bestias</h3><Cards list={trainings.filter(t => new Date(t.starts_at).getTime() >= Date.now())} open={setSelectedId} timezone={timezone} /></>}
    {tab === 'Agenda' && <><div className="titleRow"><h2 className="pageTitle">Agenda</h2>{canCoach && <button aria-label="Crear entrenamiento" className="round" onClick={() => startEdit()}><Plus /></button>}</div><Cards list={trainings} open={setSelectedId} timezone={timezone} />{!trainings.length && <Empty title="Agenda abierta" text="Aún no hay entrenamientos publicados." />}</>}
    {tab === 'Rutas' && <><h2 className="pageTitle">Rutas</h2><p className="muted">Biblioteca GPX de la manada.</p><Cards list={trainings.filter(t => routes.some(r => r.training_id === t.id))} open={setSelectedId} timezone={timezone} />{!routes.length && <Empty title="Aún no hay rutas" text="El coach puede adjuntar un GPX a cada entrenamiento." />}</>}
    {tab === 'Team' && <>
      <h2 className="pageTitle">La manada</h2><p className="muted">{members.length} miembros · Tu rol: {role}</p>
      <TeamMembers members={members} removed={removedMembers} userId={userId} role={role} busy={busy} nameOf={profileName} onRemove={removeMember} onReadmit={readmitMember} onRoleChange={(memberId: string, newRole: Role) => { void run(async () => { const result = await db.rpc('set_member_role', { t: teamId, member_id: memberId, new_role: newRole }); if (result.error) throw result.error; }); }} />
      {role === 'admin' && <section className="panel"><button className="secondary" disabled={busy} onClick={() => run(async () => { const r = await db.rpc('create_invite', { t: teamId }); if (r.error) throw r.error; setInvite(r.data); })}>Generar invitación</button><p className="muted">Válida durante 7 días. Al generar otra, la anterior deja de funcionar. Quien tenga el código podrá unirse como miembro.</p>{invite && <div className="form"><label>Código para compartir<input readOnly value={invite} onFocus={e => e.target.select()} /></label><button className="secondary" onClick={() => run(async () => { await navigator.clipboard.writeText(invite); setNotice('Código copiado.'); })}>Copiar código</button></div>}</section>}
    </>}
    {tab === 'Perfil' && <><h2 className="pageTitle">Perfil</h2><form className="form panel" onSubmit={e => { e.preventDefault(); void run(async () => { const r = await db.from('profiles').update({ display_name: displayName.trim() }).eq('id', userId); if (r.error) throw r.error; setNotice('Perfil actualizado.'); }); }}><label>Tu nombre<input required maxLength={80} value={displayName} onChange={e => setDisplayName(e.target.value)} /></label><p className="muted">{attendance.filter(a => a.user_id === userId).length} entrenamientos confirmados</p><button disabled={busy} className="primary">Guardar perfil</button></form>{joinForm}<details><summary>Crear otro equipo</summary>{createForm}</details><button className="secondary" disabled={busy} onClick={() => run(async () => { const r = await db.auth.signOut(); if (r.error) throw r.error; })}>Cerrar sesión</button></>}
    <nav>{([['Inicio',Home],['Agenda',CalendarDays],['Rutas',Map],['Team',Users],['Perfil',User]] as const).map(([name, Icon]) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}><Icon /><span>{name}</span></button>)}</nav>
  </main>;
}
function Metrics({ t }: { t: Training }) { return <div className="metrics"><b><Footprints />{t.km} km</b><b><Mountain />+{t.gain} m</b><b><Clock />{t.duration} min</b></div>; }
function Cards({ list, open, timezone }: { list: Training[]; open: (id: string) => void; timezone: string }) { return <div className="stack">{list.map(t => <button className="training-card" onClick={() => open(t.id)} key={t.id}><CalendarDays /><div><h4>{t.title}</h4><p>{fmt(t.starts_at, timezone)}</p><small>{t.place} · {t.km} km · {t.level}</small></div><ChevronRight /></button>)}</div>; }
function Empty({ title, text }: { title: string; text: string }) { return <section className="empty"><Mountain /><h2>{title}</h2><p>{text}</p></section>; }
