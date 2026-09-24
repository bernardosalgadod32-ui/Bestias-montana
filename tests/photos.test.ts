import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { photoExtension, MAX_PHOTO_BYTES } from '../lib/photos';

test('photo validation accepts supported formats and rejects empty, oversized and unsupported files', () => {
 assert.equal(photoExtension({ type: 'image/jpeg', size: MAX_PHOTO_BYTES }), 'jpg');
 assert.equal(photoExtension({ type: 'image/png', size: 1 }), 'png');
 assert.equal(photoExtension({ type: 'image/webp', size: 1 }), 'webp');
 for (const file of [{ type: 'image/heic', size: 10 }, { type: 'image/svg+xml', size: 10 }, { type: 'image/jpeg', size: 0 }, { type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 }]) assert.throws(() => photoExtension(file));
});

test('photo SQL enforces team isolation, ownership, removal revocation, and cleanup before deleting a session', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
   create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,storage to authenticated,anon;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const migration of ['202609210001_multiuser.sql','202609220001_member_removal.sql','202609240001_training_photos.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url),'utf8'));
  const admin=crypto.randomUUID(), member=crypto.randomUUID(), peer=crypto.randomUUID(), outsider=crypto.randomUUID();
  for (const id of [admin,member,peer,outsider]) await db.query('insert into auth.users(id) values($1)',[id]);
  const as = async(id:string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
  const value = async(sql:string, args:unknown[]=[]) => (await db.query<{id:string}>(sql,args)).rows[0].id;
  await as(admin); const team=await value("select public.create_team('Bestias') as id");
  const invite=await value('select public.create_invite($1) as id',[team]);
  const training=await value("insert into public.trainings(team_id,title,starts_at) values($1,'Fondo',now()) returning id",[team]);
  for (const id of [member,peer]) { await as(id); await db.query('select public.join_team($1)',[invite]); }
  const path=`${team}/${training}/${member}/${crypto.randomUUID()}.jpg`;
  await as(member);
  const insert = () => db.query("insert into public.training_photos(team_id,training_id,path,filename) values($1,$2,$3,'entreno.jpg') returning id",[team,training,path]);
  await assert.rejects(insert(),/row-level security/i);
  await db.query("insert into storage.objects(bucket_id,name) values('training-photos',$1)",[path]);
  await insert();
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('training-photos',$1)",[`${team}/${training}/${peer}/${crypto.randomUUID()}.jpg`]),/row-level security/i);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('training-photos',$1)",[`${team}/${crypto.randomUUID()}/${member}/${crypto.randomUUID()}.jpg`]),/row-level security/i);
  await as(peer);
  assert.equal((await db.query('select * from public.training_photos')).rows.length,1);
  assert.equal((await db.query("select * from storage.objects where bucket_id='training-photos'")).rows.length,1);
  assert.equal((await db.query('delete from public.training_photos returning id')).rows.length,0);
  assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);
  await assert.rejects(db.query("update public.training_photos set filename='bad.jpg'"),/permission denied/i);
  await as(outsider);
  assert.equal((await db.query('select * from public.training_photos')).rows.length,0);
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('training-photos',$1)",[`${team}/${training}/${outsider}/${crypto.randomUUID()}.jpg`]),/row-level security/i);
  await as(admin); await db.query('select public.remove_team_member($1,$2)',[team,member]);
  await assert.rejects(db.query('delete from public.trainings where id=$1',[training]),/foreign key/i);
  await as(member);
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  assert.equal((await db.query('select * from public.training_photos')).rows.length,0);
  await as(admin);
  assert.equal((await db.query('delete from storage.objects returning id')).rows.length,1);
  assert.equal((await db.query('delete from public.training_photos returning id')).rows.length,1);
  await db.query('delete from public.trainings where id=$1',[training]);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from public.training_photos'),/permission denied/i);
 } finally { await db.close(); }
});
