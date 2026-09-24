begin;
create table public.training_photos (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null,
 training_id uuid not null,
 uploaded_by uuid not null default auth.uid(),
 path text not null unique,
 filename text not null check(length(filename) between 1 and 200),
 created_at timestamptz not null default now(),
 foreign key(training_id,team_id) references public.trainings(id,team_id) on delete restrict,
 check(path ~ ('^'||team_id::text||'/'||training_id::text||'/'||uploaded_by::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
create index training_photos_session_idx on public.training_photos(training_id,created_at,id);
alter table public.training_photos enable row level security;
revoke all on public.training_photos from anon,authenticated;
grant select,insert,delete on public.training_photos to authenticated;
create policy photos_read on public.training_photos for select to authenticated using(private.team_role(team_id) is not null);
create policy photos_insert on public.training_photos for insert to authenticated with check(
 uploaded_by=auth.uid() and private.team_role(team_id) is not null
 and exists(select 1 from storage.objects o where o.bucket_id='training-photos' and o.name=path)
);
create policy photos_delete on public.training_photos for delete to authenticated using(
 private.team_role(team_id) is not null and (uploaded_by=auth.uid() or private.team_role(team_id) in ('admin','coach'))
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('training-photos','training-photos',false,10485760,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create function private.training_photo_access(object_name text, operation text) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trainings t join public.memberships m on m.team_id=t.team_id
 where m.user_id=auth.uid()
 and object_name ~ ('^'||t.team_id::text||'/'||t.id::text||'/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$')
 and (operation='read' or (operation in ('insert','delete') and split_part(object_name,'/',3)=auth.uid()::text)
 or (operation='delete' and m.role in ('admin','coach'))));
$$;
revoke all on function private.training_photo_access(text,text) from public,anon,authenticated;
grant execute on function private.training_photo_access(text,text) to authenticated;
create policy training_photos_storage_read on storage.objects for select to authenticated
 using(bucket_id='training-photos' and private.training_photo_access(name,'read'));
create policy training_photos_storage_insert on storage.objects for insert to authenticated
 with check(bucket_id='training-photos' and private.training_photo_access(name,'insert'));
create policy training_photos_storage_delete on storage.objects for delete to authenticated
 using(bucket_id='training-photos' and private.training_photo_access(name,'delete'));
-- No UPDATE permission: unique paths prevent overwriting another member's photo.
commit;
