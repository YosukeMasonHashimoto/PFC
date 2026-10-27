-- Device sessions use Supabase anonymous auth, not shared/public records.
-- Encrypted documents require membership; pairing additionally needs a 256-bit secret proof.
create table public.sync_workspaces (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 proof_hash text not null check(proof_hash ~ '^[0-9a-f]{64}$'),
 encrypted_blob text not null check(length(encrypted_blob) between 1 and 16777216),
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
create table public.sync_members (
 workspace_id uuid not null references public.sync_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(workspace_id,user_id)
);
create index sync_members_user_idx on public.sync_members(user_id);
alter table public.sync_workspaces enable row level security;
alter table public.sync_members enable row level security;
create policy sync_members_self on public.sync_members for select to authenticated using(user_id=auth.uid());
create policy sync_workspaces_members on public.sync_workspaces for select to authenticated using(exists(select 1 from public.sync_members m where m.workspace_id=id and m.user_id=auth.uid()));
revoke all on public.sync_workspaces,public.sync_members from public,anon,authenticated;
grant select on public.sync_workspaces,public.sync_members to authenticated;

create function public.sync_create(workspace uuid,proof text,blob text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null or proof !~ '^[0-9a-f]{64}$' or proof is null then raise exception 'invalid sync credentials' using errcode='42501';end if;
 if exists(select 1 from public.sync_workspaces where id=workspace) then
  if not exists(select 1 from public.sync_workspaces where id=workspace and owner_id=uid and proof_hash=encode(sha256(convert_to(proof,'UTF8')),'hex')) then raise exception 'invalid sync credentials' using errcode='42501';end if;
 else
  if (select count(*) from public.sync_workspaces where owner_id=uid)>=5 then raise exception 'workspace limit';end if;
  insert into public.sync_workspaces(id,owner_id,proof_hash,encrypted_blob) values(workspace,uid,encode(sha256(convert_to(proof,'UTF8')),'hex'),blob);
  insert into public.sync_members(workspace_id,user_id) values(workspace,uid);
 end if;
 select jsonb_build_object('revision',revision,'blob',encrypted_blob) into result from public.sync_workspaces where id=workspace;
 return result;
end $$;
create function public.sync_join(workspace uuid,proof text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();result jsonb;
begin
 if uid is null or proof is null or proof !~ '^[0-9a-f]{64}$' then raise exception 'invalid pairing code' using errcode='42501';end if;
 select jsonb_build_object('revision',revision,'blob',encrypted_blob) into result from public.sync_workspaces where id=workspace and proof_hash=encode(sha256(convert_to(proof,'UTF8')),'hex');
 if result is null then raise exception 'invalid pairing code' using errcode='42501';end if;
 insert into public.sync_members(workspace_id,user_id) values(workspace,uid) on conflict do nothing;
 return result;
end $$;
create function public.sync_read(workspace uuid,known_revision bigint default 0) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('revision',revision,'blob',case when revision=known_revision then null else encrypted_blob end) into result from public.sync_workspaces where id=workspace;
 if result is null then raise exception 'sync access denied' using errcode='42501';end if;return result;
end $$;
create function public.sync_write(workspace uuid,expected_revision bigint,blob text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.sync_members where workspace_id=workspace and user_id=auth.uid()) then raise exception 'sync access denied' using errcode='42501';end if;
 update public.sync_workspaces set encrypted_blob=blob,revision=revision+1,updated_at=now() where id=workspace and revision=expected_revision returning revision into result;
 return jsonb_build_object('revision',result,'conflict',result is null);
end $$;
revoke all on function public.sync_create(uuid,text,text),public.sync_join(uuid,text),public.sync_read(uuid,bigint),public.sync_write(uuid,bigint,text) from public,anon;
grant execute on function public.sync_create(uuid,text,text),public.sync_join(uuid,text),public.sync_read(uuid,bigint),public.sync_write(uuid,bigint,text) to authenticated;
