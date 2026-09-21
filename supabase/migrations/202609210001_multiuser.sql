begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (length(trim(display_name)) between 1 and 80),
 created_at timestamptz not null default now()
);
create table public.teams (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 80),
 timezone text not null default 'America/Mexico_City',
 created_at timestamptz not null default now()
);
create table public.memberships (
 team_id uuid not null references public.teams on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 role text not null check (role in ('admin','coach','member')),
 primary key(team_id,user_id)
);
create index memberships_user_idx on public.memberships(user_id);
create table public.trainings (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams on delete cascade,
 title text not null check(length(trim(title)) between 1 and 120),
 starts_at timestamptz not null,
 place text not null default '' check(length(place)<=300),
 km numeric not null default 0 check(km between 0 and 2000),
 gain integer not null default 0 check(gain between 0 and 100000),
 duration integer not null default 90 check(duration between 1 and 10080),
 level text not null default 'Todos' check(level in ('Todos','Principiante','Intermedio','Avanzado')),
 description text not null default '' check(length(description)<=5000),
 gear text not null default '' check(length(gear)<=2000),
 created_at timestamptz not null default now(),
 unique(id,team_id)
);
create index trainings_team_time_idx on public.trainings(team_id,starts_at);
create table public.attendance (
 training_id uuid not null,
 team_id uuid not null,
 user_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(training_id,user_id),
 foreign key(training_id,team_id) references public.trainings(id,team_id) on delete cascade,
 foreign key(team_id,user_id) references public.memberships(team_id,user_id) on delete cascade
);
create index attendance_team_user_idx on public.attendance(team_id,user_id);
create table public.routes (
 training_id uuid primary key,
 team_id uuid not null,
 path text not null unique,
 filename text not null check(length(filename) between 1 and 200),
 foreign key(training_id,team_id) references public.trainings(id,team_id) on delete cascade,
 check(path ~ ('^' || team_id::text || '/' || training_id::text || '/[0-9a-f-]{36}\.gpx$'))
);
create index routes_team_idx on public.routes(team_id);
create function private.keep_training_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id or new.team_id<>old.team_id then raise exception 'No se puede cambiar la identidad o el equipo de un entrenamiento'; end if;
 return new;
end; $$;
create trigger training_identity before update on public.trainings for each row execute function private.keep_training_identity();
create table private.invites (
 token uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams on delete cascade,
 expires_at timestamptz not null default now()+interval '7 days'
);

create function private.team_role(t uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.memberships where team_id=t and user_id=(select auth.uid());
$$;
create function private.shares_team(other_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships a join public.memberships b using(team_id) where a.user_id=(select auth.uid()) and b.user_id=other_user);
$$;
create function private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Bestia'),80));
 return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_profile();
insert into public.profiles(id,display_name)
 select id,left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),'Bestia'),80) from auth.users on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.memberships enable row level security;
alter table public.trainings enable row level security;
alter table public.attendance enable row level security;
alter table public.routes enable row level security;
alter table private.invites enable row level security;

revoke all on public.profiles,public.teams,public.memberships,public.trainings,public.attendance,public.routes from anon,authenticated;
grant select on public.profiles,public.teams,public.memberships,public.trainings,public.attendance,public.routes to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant insert,update,delete on public.trainings,public.routes to authenticated;
grant insert,delete on public.attendance to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or private.shares_team(id));
create policy profiles_edit on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy teams_read on public.teams for select to authenticated using(private.team_role(id) is not null);
create policy memberships_read on public.memberships for select to authenticated using(private.team_role(team_id) is not null);
create policy trainings_read on public.trainings for select to authenticated using(private.team_role(team_id) is not null);
create policy trainings_insert on public.trainings for insert to authenticated with check(private.team_role(team_id) in ('admin','coach'));
create policy trainings_update on public.trainings for update to authenticated using(private.team_role(team_id) in ('admin','coach')) with check(private.team_role(team_id) in ('admin','coach'));
create policy trainings_delete on public.trainings for delete to authenticated using(private.team_role(team_id) in ('admin','coach'));
create policy attendance_read on public.attendance for select to authenticated using(private.team_role(team_id) is not null);
create policy attendance_insert on public.attendance for insert to authenticated with check(user_id=(select auth.uid()) and private.team_role(team_id) is not null);
create policy attendance_delete on public.attendance for delete to authenticated using(user_id=(select auth.uid()) and private.team_role(team_id) is not null);
create policy routes_read on public.routes for select to authenticated using(private.team_role(team_id) is not null);
create policy routes_write on public.routes for all to authenticated using(private.team_role(team_id) in ('admin','coach')) with check(private.team_role(team_id) in ('admin','coach'));

-- Teams and memberships can only be changed by these narrow, transactional RPCs.
create function public.create_team(team_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 insert into public.teams(name) values(trim(team_name)) returning id into t;
 insert into public.memberships values(t,auth.uid(),'admin');
 return t;
end; $$;
create function public.create_invite(t uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare code uuid;
begin
 perform 1 from public.teams where id=t for update;
 if private.team_role(t) is distinct from 'admin' then raise exception 'Solo administradores'; end if;
 delete from private.invites where team_id=t;
 insert into private.invites(team_id) values(t) returning token into code;
 return code;
end; $$;
create function public.join_team(code uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 select team_id into t from private.invites where token=code and expires_at>now();
 if t is null then raise exception 'Invitación inválida o vencida'; end if;
 insert into public.memberships values(t,auth.uid(),'member') on conflict do nothing;
 return t;
end; $$;
create function public.set_member_role(t uuid, member_id uuid, new_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Serialize admin changes to protect the last administrator even under concurrency.
 perform 1 from public.teams where id=t for update;
 if private.team_role(t) is distinct from 'admin' then raise exception 'Solo administradores'; end if;
 if new_role not in ('admin','coach','member') or new_role is null then raise exception 'Rol inválido'; end if;
 if exists(select 1 from public.memberships where team_id=t and user_id=member_id and role='admin') and new_role<>'admin'
   and (select count(*) from public.memberships where team_id=t and role='admin')<=1 then raise exception 'Debe quedar al menos un administrador'; end if;
 update public.memberships set role=new_role where team_id=t and user_id=member_id;
 if not found then raise exception 'Miembro inexistente'; end if;
end; $$;

-- Private bucket: storage access is checked again independently of the routes table.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('gpx','gpx',false,5242880,array['application/gpx+xml'])
 on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/gpx+xml'];
create function private.gpx_access(object_name text, write_access boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trainings t join public.memberships m on m.team_id=t.team_id
 where m.user_id=(select auth.uid()) and object_name ~ ('^'||t.team_id::text||'/'||t.id::text||'/[0-9a-f-]{36}\.gpx$')
 and (not write_access or m.role in ('admin','coach')));
$$;
create policy gpx_read on storage.objects for select to authenticated using(bucket_id='gpx' and private.gpx_access(name,false));
create policy gpx_insert on storage.objects for insert to authenticated with check(bucket_id='gpx' and private.gpx_access(name,true));
create policy gpx_delete on storage.objects for delete to authenticated using(bucket_id='gpx' and private.gpx_access(name,true));
-- Files use unique names, never overwrites. There is intentionally no UPDATE policy.
revoke all on function private.team_role(uuid),private.shares_team(uuid),private.new_profile(),private.gpx_access(text,boolean) from public,anon,authenticated;
grant execute on function private.team_role(uuid),private.shares_team(uuid),private.gpx_access(text,boolean) to authenticated;
revoke all on function public.create_team(text),public.create_invite(uuid),public.join_team(uuid),public.set_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.create_team(text),public.create_invite(uuid),public.join_team(uuid),public.set_member_role(uuid,uuid,text) to authenticated;
commit;
