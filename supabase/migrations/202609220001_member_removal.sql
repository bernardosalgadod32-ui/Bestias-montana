begin;

-- Removing a membership revokes access through the existing RLS policies.
-- Keep a separate, private block so an invitation cannot undo an admin's decision.
create table private.team_removals (
 team_id uuid not null references public.teams(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 removed_at timestamptz not null default now(),
 removed_by uuid references public.profiles(id) on delete set null,
 primary key(team_id,user_id)
);
alter table private.team_removals enable row level security;
revoke all on private.team_removals from public,anon,authenticated;

create function public.remove_team_member(t uuid, member_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target_role text;
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 -- Same lock order as set_member_role/create_invite: team first, permissions next.
 perform 1 from public.teams where id=t for update;
 if private.team_role(t) is distinct from 'admin' then raise exception 'Solo administradores'; end if;
 select role into target_role from public.memberships where team_id=t and user_id=member_id;
 if not found then raise exception 'Miembro inexistente'; end if;
 if target_role='admin' and (select count(*) from public.memberships where team_id=t and role='admin')<=1 then
  raise exception 'Debe quedar al menos un administrador';
 end if;
 if member_id=auth.uid() then raise exception 'No puedes expulsarte a ti mismo'; end if;
 insert into private.team_removals(team_id,user_id,removed_at,removed_by)
  values(t,member_id,clock_timestamp(),auth.uid())
  on conflict(team_id,user_id) do update set removed_at=excluded.removed_at,removed_by=excluded.removed_by;
 -- The composite FK removes only this person's attendance in this team.
 delete from public.memberships where team_id=t and user_id=member_id;
end; $$;

create function public.readmit_team_member(t uuid, member_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 perform 1 from public.teams where id=t for update;
 if private.team_role(t) is distinct from 'admin' then raise exception 'Solo administradores'; end if;
 delete from private.team_removals where team_id=t and user_id=member_id;
 if not found then raise exception 'Esta persona no tiene una baja pendiente en el equipo'; end if;
 -- Never restore a previous coach/admin role. Roles require a separate admin decision.
 insert into public.memberships(team_id,user_id,role) values(t,member_id,'member');
end; $$;

create function public.list_removed_members(t uuid)
returns table(user_id uuid,display_name text,removed_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 if private.team_role(t) is distinct from 'admin' then raise exception 'Solo administradores'; end if;
 return query
  select r.user_id,p.display_name,r.removed_at
  from private.team_removals r join public.profiles p on p.id=r.user_id
  where r.team_id=t order by r.removed_at desc,r.user_id;
end; $$;

create or replace function public.join_team(code uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target_team uuid;
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 select i.team_id into target_team from private.invites i
  where i.token=code and i.expires_at>clock_timestamp();
 if target_team is null then raise exception 'Invitación inválida o vencida'; end if;
 perform 1 from public.teams where id=target_team for update;
 -- Recheck after waiting: removal/readmission and invite regeneration use this lock.
 -- Wall-clock time also rejects a code that expired while the lock was held.
 if not found or not exists(select 1 from private.invites i
  where i.token=code and i.team_id=target_team and i.expires_at>clock_timestamp()) then
  raise exception 'Invitación inválida o vencida';
 end if;
 if exists(select 1 from private.team_removals r where r.team_id=target_team and r.user_id=auth.uid()) then
  raise exception 'Tu acceso a este equipo fue retirado. Pide al administrador que te readmita';
 end if;
 insert into public.memberships(team_id,user_id,role) values(target_team,auth.uid(),'member') on conflict do nothing;
 return target_team;
end; $$;

revoke all on function public.remove_team_member(uuid,uuid),public.readmit_team_member(uuid,uuid),public.list_removed_members(uuid),public.join_team(uuid) from public,anon,authenticated;
grant execute on function public.remove_team_member(uuid,uuid),public.readmit_team_member(uuid,uuid),public.list_removed_members(uuid),public.join_team(uuid) to authenticated;

commit;
