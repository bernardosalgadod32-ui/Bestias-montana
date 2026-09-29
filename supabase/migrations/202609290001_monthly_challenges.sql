begin;
create table public.challenges (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 120),
 description text not null default '' check(length(description)<=3000),
 metric text not null check(metric in ('km','minutes','elevation','outings','habit')),
 target numeric(12,2) not null check(target>0 and target<=10000000),
 collective_target numeric(12,2) check(collective_target>0 and collective_target<=10000000),
 starts_on date not null, ends_on date not null,
 requires_approval boolean not null default false, archived boolean not null default false,
 created_by uuid not null default auth.uid(), created_at timestamptz not null default now(),
 unique(id,team_id), check(ends_on>=starts_on and ends_on-starts_on<=366),
 check(metric not in ('outings','habit') or (target=trunc(target) and (collective_target is null or collective_target=trunc(collective_target))))
);
create table public.challenge_participants (
 challenge_id uuid not null, team_id uuid not null, user_id uuid not null default auth.uid(),
 joined_at timestamptz not null default now(), primary key(challenge_id,user_id),
 foreign key(challenge_id,team_id) references public.challenges(id,team_id) on delete cascade,
 foreign key(team_id,user_id) references public.memberships(team_id,user_id) on delete cascade
);
create table public.challenge_entries (
 id uuid primary key, challenge_id uuid not null, team_id uuid not null, user_id uuid not null,
 activity_on date not null, amount numeric(12,2) not null check(amount>0 and amount<=10000000),
 note text not null default '' check(length(note)<=1000), evidence_path text unique,
 status text not null check(status in ('pending','approved','rejected')),
 reviewed_by uuid, review_note text not null default '' check(length(review_note)<=500), reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(challenge_id,team_id) references public.challenges(id,team_id) on delete cascade,
 foreign key(challenge_id,user_id) references public.challenge_participants(challenge_id,user_id) on delete cascade,
 check(evidence_path is null or evidence_path ~ ('^'||team_id::text||'/'||challenge_id::text||'/'||user_id::text||'/'||id::text||'\.(jpg|png|webp)$'))
);
create index challenges_team_period on public.challenges(team_id,starts_on,id);
create index challenge_entries_progress on public.challenge_entries(challenge_id,user_id,status);
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_entries enable row level security;
revoke all on public.challenges,public.challenge_participants,public.challenge_entries from anon,authenticated;
grant select on public.challenges,public.challenge_participants,public.challenge_entries to authenticated;
grant insert on public.challenges to authenticated;
create policy challenges_read on public.challenges for select to authenticated using(private.team_role(team_id) is not null);
create policy challenges_create on public.challenges for insert to authenticated with check(private.team_role(team_id) in ('admin','coach') and created_by=auth.uid() and not archived);
create policy challenge_participants_read on public.challenge_participants for select to authenticated using(private.team_role(team_id) is not null);
create policy challenge_entries_read on public.challenge_entries for select to authenticated using(private.team_role(team_id) is not null);

create function public.join_challenge(c uuid) returns void language plpgsql security definer set search_path='' as $$
declare challenge public.challenges; today date;
begin
 select * into challenge from public.challenges where id=c for share;
 if not found or private.team_role(challenge.team_id) is null then raise exception 'No tienes acceso a este reto.'; end if;
 select (now() at time zone timezone)::date into today from public.teams where id=challenge.team_id;
 if challenge.archived or today>challenge.ends_on then raise exception 'Este reto ya está cerrado.'; end if;
 insert into public.challenge_participants(challenge_id,team_id,user_id) values(c,challenge.team_id,auth.uid()) on conflict do nothing;
end; $$;

create function public.log_challenge_activity(c uuid, entry_id uuid, activity_date date, quantity numeric, activity_note text default '', proof text default null)
 returns uuid language plpgsql security definer set search_path='' as $$
declare challenge public.challenges; today date; previous public.challenge_entries;
begin
 select * into challenge from public.challenges where id=c for share;
 if not found or private.team_role(challenge.team_id) is null then raise exception 'No tienes acceso a este reto.'; end if;
 select * into previous from public.challenge_entries where id=entry_id;
 if found then
  if previous.user_id=auth.uid() and previous.challenge_id=c and previous.activity_on=activity_date and previous.amount=quantity and previous.note=activity_note and previous.evidence_path is not distinct from proof then return entry_id; end if;
  raise exception 'El identificador ya se utilizó. Vuelve a cargar el reto.';
 end if;
 select (now() at time zone timezone)::date into today from public.teams where id=challenge.team_id;
 if challenge.archived or today>challenge.ends_on or activity_date<challenge.starts_on or activity_date>challenge.ends_on or activity_date>today then raise exception 'Registra actividades realizadas dentro de las fechas de un reto abierto.'; end if;
 if quantity is null or quantity<=0 or quantity>10000000 or quantity<>round(quantity,2) or (challenge.metric in ('outings','habit') and quantity<>trunc(quantity)) then raise exception 'La cantidad no es válida para este reto.'; end if;
 if not exists(select 1 from public.challenge_participants where challenge_id=c and user_id=auth.uid()) then raise exception 'Únete al reto antes de registrar tu actividad.'; end if;
 if proof is not null and (proof !~ ('^'||challenge.team_id::text||'/'||c::text||'/'||auth.uid()::text||'/'||entry_id::text||'\.(jpg|png|webp)$') or not exists(select 1 from storage.objects where bucket_id='challenge-evidence' and name=proof)) then raise exception 'No se encontró una evidencia válida.'; end if;
 insert into public.challenge_entries(id,challenge_id,team_id,user_id,activity_on,amount,note,evidence_path,status)
 values(entry_id,c,challenge.team_id,auth.uid(),activity_date,quantity,activity_note,proof,case when challenge.requires_approval then 'pending' else 'approved' end);
 return entry_id;
end; $$;

create function public.review_challenge_entry(entry_id uuid, decision text, feedback text default '') returns void language plpgsql security definer set search_path='' as $$
declare entry public.challenge_entries;
begin
 select * into entry from public.challenge_entries where id=entry_id for update;
 if not found or coalesce(private.team_role(entry.team_id),'') not in ('admin','coach') then raise exception 'Solo el coach puede validar actividades.'; end if;
 if entry.user_id=auth.uid() then raise exception 'Otro coach debe validar tus actividades.'; end if;
 if decision not in ('approved','rejected') or decision is null then raise exception 'Decisión no válida.'; end if;
 update public.challenge_entries set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=feedback where id=entry_id;
end; $$;

create function public.delete_challenge_entry(entry_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare entry public.challenge_entries;
begin
 select * into entry from public.challenge_entries where id=entry_id for update;
 if not found or private.team_role(entry.team_id) is null or entry.user_id<>auth.uid() then raise exception 'Solo puedes eliminar tus propios registros.'; end if;
 delete from public.challenge_entries where id=entry_id;
 return entry.evidence_path;
end; $$;

create function public.archive_challenge(c uuid) returns void language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 select team_id into t from public.challenges where id=c for update;
 if not found or coalesce(private.team_role(t),'') not in ('admin','coach') then raise exception 'Solo el coach puede archivar retos.'; end if;
 update public.challenges set archived=true where id=c;
end; $$;

revoke all on function public.join_challenge(uuid),public.log_challenge_activity(uuid,uuid,date,numeric,text,text),public.review_challenge_entry(uuid,text,text),public.delete_challenge_entry(uuid),public.archive_challenge(uuid) from public,anon,authenticated;
grant execute on function public.join_challenge(uuid),public.log_challenge_activity(uuid,uuid,date,numeric,text,text),public.review_challenge_entry(uuid,text,text),public.delete_challenge_entry(uuid),public.archive_challenge(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('challenge-evidence','challenge-evidence',false,10485760,array['image/jpeg','image/png','image/webp']);
create function private.challenge_evidence_access(object_name text, operation text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.challenges c join public.memberships m on m.team_id=c.team_id join public.teams t on t.id=c.team_id
 where m.user_id=auth.uid() and object_name ~ ('^'||c.team_id::text||'/'||c.id::text||'/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$')
 and ((operation='read' and (split_part(object_name,'/',3)=auth.uid()::text or m.role in ('admin','coach')))
 or (operation='insert' and not c.archived and (now() at time zone t.timezone)::date<=c.ends_on and split_part(object_name,'/',3)=auth.uid()::text
 and exists(select 1 from public.challenge_participants p where p.challenge_id=c.id and p.user_id=auth.uid()))
 or (operation='delete' and (split_part(object_name,'/',3)=auth.uid()::text or m.role in ('admin','coach'))
 and not exists(select 1 from public.challenge_entries e where e.evidence_path=object_name))));
$$;
revoke all on function private.challenge_evidence_access(text,text) from public,anon,authenticated;
grant execute on function private.challenge_evidence_access(text,text) to authenticated;
create policy challenge_evidence_read on storage.objects for select to authenticated using(bucket_id='challenge-evidence' and private.challenge_evidence_access(name,'read'));
create policy challenge_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='challenge-evidence' and private.challenge_evidence_access(name,'insert'));
create policy challenge_evidence_delete on storage.objects for delete to authenticated using(bucket_id='challenge-evidence' and private.challenge_evidence_access(name,'delete'));
commit;
