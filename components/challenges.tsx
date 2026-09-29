'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Trophy, ArrowLeft, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { allRows } from '../lib/pagination';
import { photoExtension, downloadPhoto } from '../lib/photos';
import { CHALLENGE_BUCKET, metrics, teamToday, monthRange, challengePhase, daysRemaining, amountLabel, progress, leaderboard, type Challenge, type ChallengeEntry, type Participant, type Metric } from '../lib/challenges';

type Props = { teamId: string; userId: string; timezone: string; canCoach: boolean; nameOf: (id: string) => string; profileOnly?: boolean };
const messageOf = (e: unknown) => e && typeof e === 'object' && 'message' in e ? String(e.message) : 'No se pudo completar la operación. Inténtalo de nuevo.';
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('es-MX',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});

export default function Challenges({ teamId, userId, timezone, canCoach, nameOf, profileOnly = false }: Props) {
 const db = supabase!;
 const today = teamToday(timezone);
 const [challenges,setChallenges] = useState<Challenge[]>([]), [participants,setParticipants] = useState<Participant[]>([]), [entries,setEntries] = useState<ChallengeEntry[]>([]);
 const [selected,setSelected] = useState(''), [creating,setCreating] = useState(false), [profileUser,setProfileUser] = useState('');
 const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
 const mutation = useRef(false), version = useRef(0), draftId = useRef('');
 const [form,setForm] = useState({ title:'',description:'',metric:'km' as Metric,target:'100',collective_target:'',...monthRange(today),requires_approval:false });
 const [activity,setActivity] = useState({ activity_on:today,amount:'',note:'' }), [proof,setProof] = useState<File | null>(null), [fileKey,setFileKey] = useState(0);
 const [feedback,setFeedback] = useState<Record<string,string>>({});
 const reload = useCallback(async () => {
  const current = ++version.current;
  const [cs,ps,es] = await Promise.all([
   allRows<Challenge>((from,to) => db.from('challenges').select('*').eq('team_id',teamId).order('starts_on',{ascending:false}).order('id').range(from,to)),
   allRows<Participant>((from,to) => db.from('challenge_participants').select('challenge_id,user_id').eq('team_id',teamId).order('challenge_id').order('user_id').range(from,to)),
   allRows<ChallengeEntry>((from,to) => db.from('challenge_entries').select('*').eq('team_id',teamId).order('activity_on',{ascending:false}).order('id').range(from,to))
  ]);
  if (version.current===current) { setChallenges(cs); setParticipants(ps); setEntries(es); setLoading(false); }
 },[db,teamId]);
 useEffect(() => {
  const refresh = () => { if (!mutation.current && document.visibilityState==='visible') void reload().catch(e=>{setError(messageOf(e));setLoading(false);}); };
  void reload().catch(e=>{setError(messageOf(e));setLoading(false);});
  window.addEventListener('focus',refresh); const timer=window.setInterval(refresh,30000);
  return () => { version.current++; clearInterval(timer); window.removeEventListener('focus',refresh); };
 },[reload]);
 async function run(action: () => Promise<void>) {
  if (mutation.current) return;
  mutation.current=true;setBusy(true);setError('');setNotice('');
  try { await action(); await reload(); } catch(e) { setError(messageOf(e)); } finally { mutation.current=false;setBusy(false); }
 }
 async function rpc(name: string, args: Record<string,unknown>) { const r=await db.rpc(name,args); if(r.error) throw r.error;return r.data; }
 const challenge=challenges.find(c=>c.id===selected);
 const joined = (id: string, who=userId) => participants.some(p=>p.challenge_id===id && p.user_id===who);
 function open(c: Challenge) { setSelected(c.id);setProfileUser('');setError('');setNotice('');setActivity({activity_on:today<c.starts_on?c.starts_on:today>c.ends_on?c.ends_on:today,amount:'',note:''});setProof(null);setFileKey(k=>k+1);draftId.current=''; }
 async function saveActivity(e: React.FormEvent) {
  e.preventDefault();if(!challenge) return;
  await run(async()=>{
   const id=draftId.current || crypto.randomUUID();draftId.current=id;
   let path: string | null=null;
   if(proof) {
    path=`${teamId}/${challenge.id}/${userId}/${id}.${photoExtension(proof)}`;
    const upload=await db.storage.from(CHALLENGE_BUCKET).upload(path,proof,{contentType:proof.type,upsert:false});
    // A lost network response may leave the same immutable file in Storage; the RPC verifies its existence.
    if(upload.error && String(upload.error.statusCode)!=='409') throw upload.error;
   }
   await rpc('log_challenge_activity',{c:challenge.id,entry_id:id,activity_date:activity.activity_on,quantity:Number(activity.amount),activity_note:activity.note.trim(),proof:path});
   draftId.current='';setActivity(v=>({...v,amount:'',note:''}));setProof(null);setFileKey(k=>k+1);
   setNotice(challenge.requires_approval?'Actividad enviada al coach. Contará cuando la apruebe.':'Actividad registrada. Tu progreso ya está actualizado.');
  });
 }
 const alerts=<>{error && <div className="notice" role="alert">{error}<button className="secondary" disabled={busy} onClick={()=>void run(async()=>{})}>Actualizar</button></div>}{notice && <p className="notice" role="status">{notice}</p>}</>;
 function summary(c: Challenge, who: string) {
  const p=progress(c,entries,who);
  return <><div className="challenge-progress-label"><b>{amountLabel(p.total,c.metric)} / {amountLabel(p.target,c.metric)}</b><span>{p.percent}%</span></div><progress aria-label={`Avance en ${c.title}`} max={100} value={p.percent}/>{p.pending>0 && <small>{amountLabel(p.pending,c.metric)} pendientes de validación</small>}{p.complete && <p className="challenge-medal">🏅 Meta conquistada</p>}</>;
 }
 function profile(who: string) {
  const mine=challenges.filter(c=>joined(c.id,who)), medals=mine.filter(c=>progress(c,entries,who).complete);
  return <section className="challenge-profile"><h3>{who===userId?'Mi trayectoria':`Trayectoria de ${nameOf(who)}`}</h3><p className="muted">{mine.length} retos · {medals.length} medallas · {entries.filter(e=>e.user_id===who&&e.status==='approved').length} actividades aceptadas</p>{!mine.length && <p>Aún no hay retos en este perfil. Únete desde Retos.</p>}{mine.map(c=><button key={c.id} className="challenge-card" disabled={busy} onClick={()=>open(c)}><span className="eyebrow">{challengePhase(c,today)} · {dateLabel(c.starts_on)}</span><h4>{c.title}</h4>{summary(c,who)}</button>)}</section>;
 }
 if(loading) return <section className="challenges">{alerts}<p role="status">Cargando retos…</p></section>;
 if(creating) return <section className="challenges">{alerts}<button disabled={busy} className="back" onClick={()=>setCreating(false)}><ArrowLeft/>Volver a retos</button><h2>Crear reto</h2><p className="muted">Define qué cuenta y cómo se comprueba. Las metas y reglas se conservan al publicar; puedes archivar un reto y crear otro.</p><form className="form" onSubmit={e=>{e.preventDefault();void run(async()=>{
  const r=await db.from('challenges').insert({...form,title:form.title.trim(),description:form.description.trim(),target:Number(form.target),collective_target:form.collective_target?Number(form.collective_target):null,team_id:teamId,created_by:userId}).select('*').single();if(r.error) throw r.error;setCreating(false);open(r.data);setNotice('Reto publicado. La manada ya puede unirse.');
 })}}><fieldset disabled={busy}>
  <label>Nombre del reto<input required maxLength={120} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Octubre · 100 km de montaña"/></label>
  <label>Qué vamos a sumar<select value={form.metric} onChange={e=>setForm({...form,metric:e.target.value as Metric})}>{Object.entries(metrics).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label>Meta individual · {metrics[form.metric]}<input required type="number" min={form.metric==='habit'||form.metric==='outings'?1:0.01} max={10000000} step={form.metric==='habit'||form.metric==='outings'?1:0.01} value={form.target} onChange={e=>setForm({...form,target:e.target.value})}/></label>
  <label>Meta de la manada (opcional, misma unidad)<input type="number" min={form.metric==='habit'||form.metric==='outings'?1:0.01} max={10000000} step={form.metric==='habit'||form.metric==='outings'?1:0.01} value={form.collective_target} onChange={e=>setForm({...form,collective_target:e.target.value})}/></label>
  <div className="challenge-dates"><label>Inicio<input required type="date" value={form.starts_on} onChange={e=>setForm({...form,starts_on:e.target.value})}/></label><label>Fin<input required type="date" min={form.starts_on} value={form.ends_on} onChange={e=>setForm({...form,ends_on:e.target.value})}/></label></div>
  <label>Reglas y actividades que cuentan<textarea required maxLength={3000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Por ejemplo: suma tus km de trail. Un hábito cuenta una vez por día; describe cuál cumpliste."/></label>
  <label className="challenge-check"><input type="checkbox" checked={form.requires_approval} onChange={e=>setForm({...form,requires_approval:e.target.checked})}/>Requiere aprobación del coach</label><p className="muted">Si activas la validación, otro coach deberá revisar tus propios registros. El equipo ve cantidades y notas; solo el autor y los coaches ven la evidencia.</p>
  <button className="primary">{busy?'Publicando…':'Publicar reto'}</button>
 </fieldset></form></section>;
 if(challenge) {
  const c=challenge, phase=challengePhase(c,today), rows=leaderboard(c,participants,entries), mine=entries.filter(e=>e.challenge_id===c.id&&e.user_id===userId), review=entries.filter(e=>e.challenge_id===c.id&&e.user_id!==userId), collective=progress(c,entries);
  return <section className="challenges">{alerts}<button className="back" disabled={busy} onClick={()=>setSelected('')}><ArrowLeft/>{profileOnly?'Volver a mi trayectoria':'Volver a retos'}</button><span className="eyebrow">{phase}</span><h2>{c.title}</h2><p className="muted">{dateLabel(c.starts_on)} — {dateLabel(c.ends_on)} · {timezone}</p><p className="copy">{c.description}</p><p className="muted">{c.requires_approval?'El coach valida cada actividad.':'Los registros cuentan al guardarlos.'} Registra antes del fin del reto; después solo se revisan los pendientes.</p>
   <div className="panel"><h3>Tu avance</h3>{summary(c,userId)}{phase==='En marcha'&&<p>{daysRemaining(c,today)} días restantes, incluido hoy</p>}{!joined(c.id)&&!c.archived&&today<=c.ends_on&&<button className="primary" disabled={busy} onClick={()=>void run(async()=>{await rpc('join_challenge',{c:c.id});setNotice('Ya eres parte del reto.');})}>Unirme al reto</button>}</div>
   {c.collective_target && <div className="panel"><h3>La meta de la manada</h3><b>{amountLabel(collective.total,c.metric)} / {amountLabel(collective.target,c.metric)}</b><progress aria-label="Avance colectivo" value={collective.percent} max={100}/>{collective.complete&&<p>🏔️ ¡Meta de equipo conquistada!</p>}</div>}
   {joined(c.id)&&phase==='En marcha'&&<details className="panel" open><summary>Registrar mi actividad</summary><form className="form" onSubmit={saveActivity}><fieldset disabled={busy}>
    <label>Fecha de la actividad<input required type="date" min={c.starts_on} max={today<c.ends_on?today:c.ends_on} value={activity.activity_on} onChange={e=>{draftId.current='';setActivity({...activity,activity_on:e.target.value});}}/></label>
    <label>Cantidad · {metrics[c.metric]}<input required type="number" min={c.metric==='habit'||c.metric==='outings'?1:0.01} max={10000000} step={c.metric==='habit'||c.metric==='outings'?1:0.01} value={activity.amount} onChange={e=>{draftId.current='';setActivity({...activity,amount:e.target.value});}}/></label>{c.metric==='minutes'&&<small>Registra minutos: 1 hora y media = 90.</small>}
    <label>Actividad o hábito realizado<textarea required maxLength={1000} value={activity.note} onChange={e=>{draftId.current='';setActivity({...activity,note:e.target.value});}}/></label>
    <label>Evidencia opcional · JPG, PNG o WebP · 10 MB<input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{draftId.current='';const f=e.target.files?.[0];setProof(null);if(f)try{photoExtension(f);setProof(f);setError('');}catch(err){setError(messageOf(err));e.target.value='';}}}/></label><small>El equipo ve la actividad y tu nota. Solo tú y los coaches pueden descargar la evidencia. «Voy» no suma progreso.</small>
    <button className="primary">{busy?'Guardando…':'Guardar actividad'}</button>
   </fieldset></form></details>}
   <h3>Clasificación · {rows.length} participantes</h3><p className="muted">Solo suma lo aceptado. Los empates comparten puesto. Pulsa un nombre para ver su trayectoria.</p><ol className="challenge-ranking">{rows.map(row=><li key={row.userId}><span>#{row.rank}</span><button disabled={busy} onClick={()=>setProfileUser(profileUser===row.userId?'':row.userId)}>{nameOf(row.userId)}{row.userId===userId?' (tú)':''}</button><b>{amountLabel(row.total,c.metric)}{row.complete?' 🏅':''}</b></li>)}</ol>{!rows.length&&<p className="muted">Sé la primera Bestia en unirte.</p>}{profileUser&&profile(profileUser)}
   <h3>Mis registros</h3>{!mine.length&&<p className="muted">Todavía no has registrado actividades.</p>}{mine.map(entry=>entryCard(entry,c,false))}
   {canCoach&&<details className="panel"><summary>Revisar actividades · {review.filter(e=>e.status==='pending').length} pendientes</summary>{!review.length&&<p>No hay actividades de otros miembros.</p>}{[...review].sort((a,b)=>Number(b.status==='pending')-Number(a.status==='pending')).map(entry=>entryCard(entry,c,true))}<p className="muted">Otro coach debe revisar tus propios registros. Puedes corregir una decisión; el progreso se recalcula.</p></details>}
   {canCoach&&!c.archived&&<button className="secondary" disabled={busy} onClick={()=>{if(window.confirm('¿Archivar este reto? Se conservará el historial y no se admitirán nuevas actividades.'))void run(async()=>{await rpc('archive_challenge',{c:c.id});setNotice('Reto archivado.');});}}>Archivar reto</button>}
  </section>;
 }
 function entryCard(entry: ChallengeEntry,c: Challenge,moderate: boolean) {
  return <div key={entry.id} className="challenge-entry"><strong>{moderate?`${nameOf(entry.user_id)} · `:''}{amountLabel(Number(entry.amount),c.metric)}</strong><p>{dateLabel(entry.activity_on)} · <span className={`entry-${entry.status}`}>{{pending:'Pendiente',approved:'Aceptado',rejected:'No aceptado'}[entry.status]}</span></p><p className="copy">{entry.note}</p>{entry.review_note&&<p>Coach: {entry.review_note}</p>}
   {entry.evidence_path&&<button className="secondary" disabled={busy} onClick={()=>void run(async()=>{const r=await db.storage.from(CHALLENGE_BUCKET).download(entry.evidence_path!);if(r.error)throw r.error;downloadPhoto(r.data,`evidencia-${entry.activity_on}.${entry.evidence_path!.split('.').pop()}`);})}>Descargar evidencia</button>}
   {moderate?<><label>Comentario del coach<input aria-label={`Comentario para ${nameOf(entry.user_id)} del ${entry.activity_on}`} maxLength={500} value={feedback[entry.id]??entry.review_note} disabled={busy} onChange={e=>setFeedback({...feedback,[entry.id]:e.target.value})}/></label><div className="challenge-actions"><button className="primary" disabled={busy||entry.status==='approved'} onClick={()=>void run(async()=>{await rpc('review_challenge_entry',{entry_id:entry.id,decision:'approved',feedback:feedback[entry.id]??entry.review_note});setNotice('Actividad aceptada.');})}>Aceptar</button><button className="secondary" disabled={busy||entry.status==='rejected'} onClick={()=>void run(async()=>{await rpc('review_challenge_entry',{entry_id:entry.id,decision:'rejected',feedback:feedback[entry.id]??entry.review_note});setNotice('Actividad no aceptada.');})}>No aceptar</button></div></>:<button className="secondary" disabled={busy} onClick={()=>{if(window.confirm('¿Eliminar este registro? Su cantidad dejará de contar. Solo podrás registrarlo de nuevo si el reto sigue abierto.'))void run(async()=>{const path=await rpc('delete_challenge_entry',{entry_id:entry.id});setNotice('Registro eliminado.');if(path){const r=await db.storage.from(CHALLENGE_BUCKET).remove([path]);if(r.error)setNotice('Registro eliminado. No se pudo limpiar su archivo de evidencia.');}});}}>Eliminar mi registro</button>}
  </div>;
 }
 return <section className="challenges">{alerts}{profileOnly?profile(userId):<><div className="titleRow"><h2 className="pageTitle"><Trophy/> Retos de la manada</h2>{canCoach&&<button aria-label="Crear reto" disabled={busy} className="round" onClick={()=>{setForm({title:'',description:'',metric:'km',target:'100',collective_target:'',...monthRange(today),requires_approval:false});setCreating(true);}}><Plus/></button>}</div><p className="muted">Una meta, muchas aventuras. Únete, registra tu esfuerzo y sigue tu progreso.</p>{!challenges.length&&<div className="empty"><Trophy/><h3>El próximo reto empieza aquí</h3><p>{canCoach?'Crea el primer reto con el botón +.':'Tu coach publicará aquí los retos del equipo.'}</p></div>}{(['En marcha','Próximamente','Finalizado','Archivado'] as const).map(phase=>{const list=challenges.filter(c=>challengePhase(c,today)===phase);return list.length>0&&<div key={phase}><h3>{phase}</h3>{list.map(c=><button className="challenge-card" disabled={busy} key={c.id} onClick={()=>open(c)}><span className="eyebrow">{metrics[c.metric]} · {c.requires_approval?'Con validación':'Registro directo'}</span><h3>{c.title}</h3><p>{dateLabel(c.starts_on)} — {dateLabel(c.ends_on)}</p>{joined(c.id)?summary(c,userId):<b>Meta: {amountLabel(Number(c.target),c.metric)}</b>}<p className="muted">{participants.filter(p=>p.challenge_id===c.id).length} participantes · Ver reto →</p></button>)}</div>})}</>}</section>;
}
