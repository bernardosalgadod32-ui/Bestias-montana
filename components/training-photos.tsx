'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Download, Share2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadPhoto, MAX_PHOTO_BATCH, PHOTO_BUCKET, photoExtension, type TrainingPhoto } from '../lib/photos';
type LoadedPhoto = TrainingPhoto & { url?: string; blob?: Blob };
const PAGE_SIZE = 12;
const messageOf = (e: unknown) => e && typeof e === 'object' && 'message' in e ? String(e.message) : 'No se pudo completar la operación. Inténtalo de nuevo.';

export default function TrainingPhotos({ trainingId, teamId, userId, canModerate, client = supabase! }: { trainingId: string; teamId: string; userId: string; canModerate: boolean; client?: SupabaseClient }) {
 const [photos, setPhotos] = useState<LoadedPhoto[]>([]), [page, setPage] = useState(0), [more, setMore] = useState(false);
 const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
 const [revision, setRevision] = useState(0);
 const lock = useRef(false), input = useRef<HTMLInputElement>(null);
 const refresh = useCallback(() => setRevision(n => n + 1), []);
 useEffect(() => {
  let active = true; const urls: string[] = [];
  setLoading(true); setPhotos([]);
  void (async () => {
   const result = await client.from('training_photos').select('*').eq('team_id', teamId).eq('training_id', trainingId).order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
   if (result.error) throw result.error;
   const rows = result.data as TrainingPhoto[];
   let failed = false;
   const loaded = await Promise.all(rows.slice(0, PAGE_SIZE).map(async row => {
    const result = await client.storage.from(PHOTO_BUCKET).download(row.path);
    if (result.error || !result.data) { failed = true; return row; }
    if (!active) return row;
    const url = URL.createObjectURL(result.data); urls.push(url); return { ...row, url, blob: result.data };
   }));
   if (active) { setPhotos(loaded); setMore(rows.length > PAGE_SIZE); if (failed) setError('Algunas fotos no se pudieron cargar. Puedes volver a intentarlo.'); }
  })().catch(e => { if (active) setError(messageOf(e)); }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
 }, [client, trainingId, teamId, page, revision]);

 async function upload(files: File[]) {
  if (lock.current || !files.length) return;
  setError(''); setNotice('');
  try {
   if (files.length > MAX_PHOTO_BATCH) throw new Error('Selecciona hasta 10 fotos por carga.');
   files.forEach(photoExtension);
  } catch (e) { setError(messageOf(e)); if (input.current) input.current.value = ''; return; }
  lock.current = true; setBusy(true); let saved = 0; const failures: string[] = [];
  try {
   for (const file of files) {
    setNotice(`Subiendo foto ${saved + failures.length + 1} de ${files.length}…`);
    const path = `${teamId}/${trainingId}/${userId}/${crypto.randomUUID()}.${photoExtension(file)}`;
    try {
     const uploaded = await client.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
     if (uploaded.error) throw uploaded.error;
     const inserted = await client.from('training_photos').insert({ team_id: teamId, training_id: trainingId, uploaded_by: userId, path, filename: file.name.slice(0, 200) });
     if (inserted.error) {
      const cleanup = await client.storage.from(PHOTO_BUCKET).remove([path]);
      throw new Error(`${messageOf(inserted.error)}${cleanup.error ? ' No se pudo limpiar el archivo subido; contacta al administrador.' : ''}`);
     }
     saved++;
    } catch (e) { failures.push(`${file.name}: ${messageOf(e)}`); }
   }
   setNotice(`${saved} de ${files.length} fotos compartidas con el equipo.`);
   if (failures.length) setError(failures.join('\n'));
  } finally { lock.current = false; setBusy(false); if (input.current) input.current.value = ''; if (saved) { setPage(0); refresh(); } }
 }
 async function remove(photo: TrainingPhoto) {
  if (lock.current || !window.confirm('¿Eliminar esta foto del álbum del equipo?')) return;
  lock.current = true; setBusy(true); setError(''); setNotice('');
  try {
   const removed = await client.storage.from(PHOTO_BUCKET).remove([photo.path]); if (removed.error) throw removed.error;
   const row = await client.from('training_photos').delete().eq('id', photo.id).select('id').single(); if (row.error) throw row.error;
   setNotice('Foto eliminada.'); if (photos.length === 1 && page > 0) setPage(page - 1); else refresh();
  } catch (e) { setError(messageOf(e)); } finally { lock.current = false; setBusy(false); }
 }
 async function share(photo: LoadedPhoto) {
  if (!photo.blob) return;
  const file = new File([photo.blob], photo.filename, { type: photo.blob.type });
  setError('');
  try {
   if (navigator.canShare?.({ files: [file] }) && navigator.share) await navigator.share({ files: [file], title: 'Bestias de la Montaña' });
   else { downloadPhoto(photo.blob, photo.filename); setNotice('Foto descargada. Ábrela desde tu red social favorita para publicarla.'); }
  } catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setError('No se pudo compartir. Usa Descargar y abre la foto desde tu red social.'); }
 }
 return <section className="photo-album" aria-labelledby="album-title">
  <div className="titleRow"><h3 id="album-title"><Camera size={22} /> Fotos del entreno</h3><button className="secondary" disabled={busy || loading} onClick={refresh}>Actualizar</button></div>
  <p className="muted">Los recuerdos de la manada, en un solo lugar. Comparte fotos que el equipo pueda descargar y publicar en sus redes.</p>
  <label className="photo-upload">{busy ? 'Subiendo / guardando…' : 'Subir fotos del entrenamiento'}<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || loading} onChange={e => void upload(Array.from(e.target.files || []))} /></label>
  <p className="muted">Hasta 10 fotos por carga · JPG, PNG o WebP · 10 MB por foto.</p>
  {notice && <p role="status" className="notice">{notice}</p>}{error && <div role="alert" className="notice copy">{error}<button className="secondary" disabled={busy || loading} onClick={refresh}>Volver a intentar</button></div>}
  {loading ? <p role="status">Cargando fotos…</p> : !photos.length ? <p className="photo-empty">Todavía no hay fotos en esta página. ¡Comparte el primer recuerdo!</p> : <div className="photo-grid">{photos.map(photo => <article className="photo-card" key={photo.id}>
   {photo.url ? <a href={photo.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${photo.filename}`}><img src={photo.url} alt={`Foto del entrenamiento: ${photo.filename}`} loading="lazy" /></a> : <p>Vista previa no disponible</p>}
   <p>{photo.uploaded_by === userId ? 'Tu foto' : 'Foto de la manada'}</p>
   <div className="photo-actions"><button className="secondary" disabled={!photo.blob || busy} onClick={() => downloadPhoto(photo.blob!, photo.filename)}><Download size={16} />Descargar</button><button className="secondary" disabled={!photo.blob || busy} onClick={() => void share(photo)}><Share2 size={16} />Compartir</button>
   {(canModerate || photo.uploaded_by === userId) && <button className="secondary" disabled={busy} onClick={() => void remove(photo)}><Trash2 size={16} />Eliminar</button>}</div>
  </article>)}</div>}
  <div className="photo-pagination"><button className="secondary" disabled={!page || busy || loading} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button className="secondary" disabled={!more || busy || loading} onClick={() => setPage(page + 1)}>Siguiente</button></div>
 </section>;
}
