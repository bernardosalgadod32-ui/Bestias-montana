import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('incremental member removal preserves accounts and team data while revoking access and controlling readmission', async t => {
 const db = new PGlite();
 try {
  // Only platform-owned auth/storage schemas are simulated; both migrations run unchanged.
  await db.exec(`create role anon; create role authenticated;
   create schema auth; create schema storage;
   create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,storage to authenticated,anon;
   grant execute on function auth.uid() to authenticated,anon;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   grant select,insert,update,delete on storage.objects to authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/202609210001_multiuser.sql', import.meta.url),'utf8'));
  const admin='20000000-0000-0000-0000-000000000001', coach='20000000-0000-0000-0000-000000000002';
  const member='20000000-0000-0000-0000-000000000003', outsider='20000000-0000-0000-0000-000000000004';
  const secondAdmin='20000000-0000-0000-0000-000000000005';
  const identities = [admin,coach,member,outsider,secondAdmin];
  for (const [index,id] of identities.entries()) await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[id,{display_name:`Persona ${index+1}`}]);
  const as = async(id: string) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
  const rows = async(sql: string, params: unknown[] = []) => (await db.query<Record<string,unknown>>(sql,params)).rows;
  const value = async(sql: string, params: unknown[] = []) => (await rows(sql,params))[0].value as string;
  const count = async(sql: string, params: unknown[] = []) => Number(await value(sql,params));
  await as(admin);
  const team = await value("select public.create_team('Bestias') as value");
  const invite = await value('select public.create_invite($1) as value',[team]);
  for (const id of [coach,member,secondAdmin]) { await as(id); await db.query('select public.join_team($1)',[invite]); }
  await as(admin);
  await db.query("select public.set_member_role($1,$2,'coach')",[team,coach]);
  await db.query("select public.set_member_role($1,$2,'admin')",[team,secondAdmin]);
  await as(outsider);
  const otherTeam = await value("select public.create_team('Otro equipo') as value");
  const otherInvite = await value('select public.create_invite($1) as value',[otherTeam]);
  const otherTraining = await value("insert into public.trainings(team_id,title,starts_at) values($1,'Otra salida',now()) returning id as value",[otherTeam]);
  for (const id of [coach,member]) { await as(id); await db.query('select public.join_team($1)',[otherInvite]); }
  await as(coach);
  const training = await value("insert into public.trainings(team_id,title,starts_at) values($1,'Salida del coach',now()) returning id as value",[team]);
  const path = `${team}/${training}/${crypto.randomUUID()}.gpx`;
  await db.query("insert into storage.objects(bucket_id,name) values('gpx',$1)",[path]);
  await db.query('insert into public.routes(training_id,team_id,path,filename) values($1,$2,$3,$4)',[training,team,path,'salida.gpx']);
  for (const id of [coach,member]) {
   await as(id);
   await db.query('insert into public.attendance(training_id,team_id,user_id) values($1,$2,$3),($4,$5,$3)',[training,team,id,otherTraining,otherTeam]);
  }
  // Apply the new migration to an already populated installation.
  await db.exec('reset role');
  await db.exec(await readFile(new URL('../supabase/migrations/202609220001_member_removal.sql', import.meta.url),'utf8'));

  await t.test('only team admins can call management RPCs; private removal records are inaccessible', async () => {
   for (const id of [coach,member,outsider]) {
    await as(id);
    await assert.rejects(db.query('select public.remove_team_member($1,$2)',[team,secondAdmin]),/Solo administradores/);
    await assert.rejects(db.query('select public.readmit_team_member($1,$2)',[team,secondAdmin]),/Solo administradores/);
    await assert.rejects(db.query('select * from public.list_removed_members($1)',[team]),/Solo administradores/);
   }
   await as(admin);
   for (const rpc of ['remove_team_member','readmit_team_member']) await assert.rejects(db.query(`select public.${rpc}($1,$2)`,[otherTeam,coach]),/Solo administradores/);
   await assert.rejects(db.query('select * from public.list_removed_members($1)',[otherTeam]),/Solo administradores/);
   await assert.rejects(db.query('select * from private.team_removals'),/permission denied/i);
   await assert.rejects(db.query('insert into private.team_removals(team_id,user_id) values($1,$2)',[team,coach]),/permission denied/i);
   await assert.rejects(db.query('delete from private.team_removals'),/permission denied/i);
   await assert.rejects(db.query('update private.team_removals set removed_by=$1',[admin]),/permission denied/i);
   assert.deepEqual(await rows('select * from public.list_removed_members($1)',[team]),[]);
   await assert.rejects(db.query('select public.readmit_team_member($1,$2)',[team,coach]),/baja pendiente/);
   await assert.rejects(db.query('select public.remove_team_member($1,$2)',[team,outsider]),/Miembro inexistente/);
   assert.equal(await count('select count(*) as value from public.memberships where team_id=$1',[team]),4);
  });

  await t.test('self removal and losing the last administrator are rejected atomically', async () => {
   await as(admin);
   await assert.rejects(db.query('select public.remove_team_member($1,$2)',[team,admin]),/No puedes expulsarte/);
   await db.query("select public.set_member_role($1,$2,'member')",[team,secondAdmin]);
   await assert.rejects(db.query('select public.remove_team_member($1,$2)',[team,admin]),/al menos un administrador/);
   await assert.rejects(db.query("select public.set_member_role($1,$2,'member')",[team,admin]),/al menos un administrador/);
   assert.equal(await value('select role as value from public.memberships where team_id=$1 and user_id=$2',[team,admin]),'admin');
   assert.deepEqual(await rows('select * from public.list_removed_members($1)',[team]),[]);
   await db.query("select public.set_member_role($1,$2,'admin')",[team,secondAdmin]);
  });

  await t.test('removal revokes an existing identity and cascades only their attendance in the selected team', async () => {
   await as(admin);
   await db.query('select public.remove_team_member($1,$2)',[team,coach]);
   const removed = await rows('select * from public.list_removed_members($1)',[team]);
   assert.equal(removed.length,1); assert.equal(removed[0].user_id,coach);
   assert.equal(removed[0].display_name,'Persona 2'); assert.ok(removed[0].removed_at);
   assert.equal(await count('select count(*) as value from public.attendance where team_id=$1 and user_id=$2',[team,coach]),0);
   assert.equal(await count('select count(*) as value from public.attendance where team_id=$1 and user_id=$2',[team,member]),1);
   assert.equal(await count('select count(*) as value from public.trainings where id=$1',[training]),1);
   assert.equal(await count('select count(*) as value from public.routes where training_id=$1',[training]),1);
   assert.equal(await count('select count(*) as value from storage.objects where name=$1',[path]),1);
   // Reuse the same user id/JWT claim: no token/session invalidation is required by RLS.
   await as(coach);
   assert.equal(await value('select auth.uid()::text as value'),coach);
   for (const table of ['memberships','trainings','attendance','routes']) {
    assert.equal((await rows(`select * from public.${table} where team_id=$1`,[team])).length,0);
   }
   assert.equal((await rows('select * from public.teams where id=$1',[team])).length,0);
   assert.equal((await rows('select * from public.profiles where id=$1',[admin])).length,0);
   assert.equal((await rows('select * from storage.objects where name=$1',[path])).length,0);
   await assert.rejects(db.query("insert into public.trainings(team_id,title,starts_at) values($1,'No autorizado',now())",[team]),/row-level security/i);
   assert.equal((await rows("update public.trainings set title='No autorizado' where id=$1 returning id",[training])).length,0);
   assert.equal((await rows('delete from public.trainings where id=$1 returning id',[training])).length,0);
   await assert.rejects(db.query('insert into public.attendance(training_id,team_id,user_id) values($1,$2,$3)',[training,team,coach]),/row-level security/i);
   await assert.rejects(db.query('insert into public.routes(training_id,team_id,path,filename) values($1,$2,$3,$4)',[training,team,path,'hack.gpx']),/row-level security/i);
   assert.equal((await rows('delete from public.routes where training_id=$1 returning training_id',[training])).length,0);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('gpx',$1)",[`${team}/${training}/${crypto.randomUUID()}.gpx`]),/row-level security/i);
   assert.equal((await rows('delete from storage.objects where name=$1 returning id',[path])).length,0);
   assert.equal(await count('select count(*) as value from public.memberships where team_id=$1 and user_id=$2',[otherTeam,coach]),1);
   assert.equal(await count('select count(*) as value from public.attendance where team_id=$1 and user_id=$2',[otherTeam,coach]),1);
   assert.equal(await count('select count(*) as value from public.profiles where id=$1',[coach]),1);
   await db.exec('reset role');
   assert.equal(await count('select count(*) as value from auth.users'),identities.length);
   assert.equal(await count('select count(*) as value from public.profiles'),identities.length);
   assert.equal(await count('select count(*) as value from public.trainings'),2);
   assert.equal(await count('select count(*) as value from public.routes'),1);
   assert.equal(await value('select removed_by::text as value from private.team_removals where team_id=$1 and user_id=$2',[team,coach]),admin);
   assert.equal(await value("select relrowsecurity::text as value from pg_class where oid='private.team_removals'::regclass"),'true');
  });

  await t.test('old and new invitations cannot bypass removal; only an admin can readmit as member', async () => {
   await as(coach);
   await assert.rejects(db.query('select public.join_team($1)',[invite]),/acceso.*retirado/);
   await assert.rejects(db.query('select public.readmit_team_member($1,$2)',[team,coach]),/Solo administradores/);
   await assert.rejects(db.query('select * from public.list_removed_members($1)',[team]),/Solo administradores/);
   await assert.rejects(db.query('select * from private.team_removals'),/permission denied/i);
   await as(admin);
   const newInvite = await value('select public.create_invite($1) as value',[team]);
   await as(coach);
   await assert.rejects(db.query('select public.join_team($1)',[invite]),/Invitación inválida/);
   await assert.rejects(db.query('select public.join_team($1)',[newInvite]),/acceso.*retirado/);
   await as(admin);
   await db.query('select public.readmit_team_member($1,$2)',[team,coach]);
   assert.deepEqual(await rows('select * from public.list_removed_members($1)',[team]),[]);
   assert.equal(await value('select role as value from public.memberships where team_id=$1 and user_id=$2',[team,coach]),'member');
   await as(coach);
   await db.query('select public.join_team($1)',[newInvite]);
   assert.equal(await value('select role as value from public.memberships where team_id=$1 and user_id=$2',[team,coach]),'member');
   assert.equal(await count('select count(*) as value from public.attendance where team_id=$1 and user_id=$2',[team,coach]),0);
   assert.equal(await count('select count(*) as value from storage.objects where name=$1',[path]),1);
   await assert.rejects(db.query("insert into public.trainings(team_id,title,starts_at) values($1,'No soy coach',now())",[team]),/row-level security/i);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('gpx',$1)",[`${team}/${training}/${crypto.randomUUID()}.gpx`]),/row-level security/i);
   await db.query('insert into public.attendance(training_id,team_id,user_id) values($1,$2,$3)',[training,team,coach]);
   await as(admin);
   await db.query('select public.join_team($1)',[newInvite]);
   assert.equal(await value('select role as value from public.memberships where team_id=$1 and user_id=$2',[team,admin]),'admin');
   // Removing a second admin must also discard their previous elevated role on readmission.
   await db.query('select public.remove_team_member($1,$2)',[team,secondAdmin]);
   await as(secondAdmin);
   await assert.rejects(db.query('select public.remove_team_member($1,$2)',[team,admin]),/Solo administradores/);
   await assert.rejects(db.query('select public.readmit_team_member($1,$2)',[team,secondAdmin]),/Solo administradores/);
   await as(admin);
   await db.query('select public.readmit_team_member($1,$2)',[team,secondAdmin]);
   assert.equal(await value('select role as value from public.memberships where team_id=$1 and user_id=$2',[team,secondAdmin]),'member');
   await assert.rejects(db.query('select public.readmit_team_member($1,$2)',[team,secondAdmin]),/baja pendiente/);
  });

  await t.test('expired invitations use wall-clock time even inside an older transaction', async () => {
   await db.exec('reset role; begin');
   const expiredInvite = crypto.randomUUID();
   try {
    // Start the transaction before creating the code: now() must remain earlier than expiry.
    await db.query("insert into private.invites(token,team_id,expires_at) values($1,$2,clock_timestamp()+interval '100 milliseconds')",[expiredInvite,team]);
    await as(outsider);
    await db.query('select pg_sleep(0.15)');
    await assert.rejects(db.query('select public.join_team($1)',[expiredInvite]),/Invitación inválida/);
   } finally { await db.exec('rollback'); }
   await as(outsider);
   assert.equal(await count('select count(*) as value from public.memberships where team_id=$1',[team]),0);
  });

  await t.test('anonymous and missing-identity calls cannot execute privileged actions', async () => {
   await as('');
   for (const rpc of ['remove_team_member','readmit_team_member']) await assert.rejects(db.query(`select public.${rpc}($1,$2)`,[team,coach]),/Inicia sesión/);
   await assert.rejects(db.query('select * from public.list_removed_members($1)',[team]),/Inicia sesión/);
   await assert.rejects(db.query('select public.join_team($1)',[otherInvite]),/Inicia sesión/);
   await db.exec('reset role; set role anon');
   for (const rpc of ['remove_team_member','readmit_team_member']) await assert.rejects(db.query(`select public.${rpc}($1,$2)`,[team,coach]),/permission denied/i);
   await assert.rejects(db.query('select * from public.list_removed_members($1)',[team]),/permission denied/i);
   await assert.rejects(db.query('select public.join_team($1)',[otherInvite]),/permission denied/i);
   await assert.rejects(db.query('select * from private.team_removals'),/permission denied/i);
  });
 } finally { await db.close(); }
});
