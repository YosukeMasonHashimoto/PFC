-- All application RPCs are SECURITY INVOKER: RLS applies even to direct calls.
create table public.profiles (
 user_id uuid primary key references auth.users on delete cascade,
 timezone text not null default 'Asia/Tokyo' check (timezone = 'Asia/Tokyo'),
 created_at timestamptz not null default now()
);
create table public.nutrition_targets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 effective_from date not null, protein_g numeric not null check(protein_g between 0 and 100000),
 fat_g numeric not null check(fat_g between 0 and 100000), carbs_g numeric not null check(carbs_g between 0 and 100000),
 calories_kcal numeric not null check(calories_kcal between 0 and 100000), unique(user_id,effective_from)
);
create table public.foods (
 id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users on delete cascade,
 name text not null check(length(trim(name)) between 1 and 150), brand text not null default '' check(length(brand)<=150),
 protein_100g numeric not null check(protein_100g between 0 and 100000), fat_100g numeric not null check(fat_100g between 0 and 100000),
 carbs_100g numeric not null check(carbs_100g between 0 and 100000), kcal_100g numeric not null check(kcal_100g between 0 and 100000),
 source_type text not null check(source_type in ('manual','mext','manufacturer','estimated')),
 source_ref text not null default '' check(length(source_ref)<=1000), source_version text not null default '' check(length(source_version)<=150),
 energy_basis text not null check(length(energy_basis) between 1 and 150), created_at timestamptz not null default now()
);
create index foods_owner_idx on public.foods(owner_id);
create table public.food_portions (
 id uuid primary key default gen_random_uuid(), food_id uuid not null references public.foods on delete cascade,
 label text not null check(length(trim(label)) between 1 and 50), grams numeric not null check(grams>0 and grams<=100000),unique(food_id,label)
);
create table public.favorite_foods (
 user_id uuid not null references auth.users on delete cascade, food_id uuid not null references public.foods on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,food_id)
);
create table public.meal_entries (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 food_id uuid references public.foods on delete set null, food_name_snapshot text not null,
 source_snapshot jsonb not null default '{}', consumed_at timestamptz not null, local_date date not null,
 meal_type text not null check(meal_type in ('breakfast','lunch','dinner','snack')),
 amount_g numeric not null check(amount_g>0 and amount_g<=100000),
 protein_g numeric not null check(protein_g>=0),fat_g numeric not null check(fat_g>=0),carbs_g numeric not null check(carbs_g>=0),calories_kcal numeric not null check(calories_kcal>=0),
 created_at timestamptz not null default now()
);
create index meal_entries_date_idx on public.meal_entries(user_id,local_date,consumed_at);
create table public.meal_templates (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),created_at timestamptz not null default now()
);
create table public.meal_template_items (
 id uuid primary key default gen_random_uuid(),template_id uuid not null references public.meal_templates on delete cascade,
 food_id uuid not null references public.foods on delete cascade, amount_g numeric not null check(amount_g>0 and amount_g<=100000)
);
create index template_items_parent_idx on public.meal_template_items(template_id);
create index template_items_food_idx on public.meal_template_items(food_id);
alter table public.profiles enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.foods enable row level security;
alter table public.food_portions enable row level security;
alter table public.favorite_foods enable row level security;
alter table public.meal_entries enable row level security;
alter table public.meal_templates enable row level security;
alter table public.meal_template_items enable row level security;
create policy profile_self on public.profiles for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy target_self on public.nutrition_targets for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy food_read on public.foods for select to authenticated using(owner_id is null or owner_id=auth.uid());
create policy food_insert on public.foods for insert to authenticated with check(owner_id=auth.uid());
create policy food_update on public.foods for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy food_delete on public.foods for delete to authenticated using(owner_id=auth.uid());
create policy portion_read on public.food_portions for select to authenticated using(exists(select 1 from public.foods f where f.id=food_id));
create policy portion_write on public.food_portions for all to authenticated using(exists(select 1 from public.foods f where f.id=food_id and f.owner_id=auth.uid())) with check(exists(select 1 from public.foods f where f.id=food_id and f.owner_id=auth.uid()));
create policy favorite_self on public.favorite_foods for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.foods f where f.id=food_id));
create policy meal_self on public.meal_entries for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (food_id is null or exists(select 1 from public.foods f where f.id=food_id)));
create policy template_self on public.meal_templates for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy template_item_self on public.meal_template_items for all to authenticated using(exists(select 1 from public.meal_templates t where t.id=template_id and t.user_id=auth.uid())) with check(exists(select 1 from public.meal_templates t where t.id=template_id and t.user_id=auth.uid()) and exists(select 1 from public.foods f where f.id=food_id));

-- Ownership cannot be changed to another user or from private to shared.
create function public.prevent_owner_change() returns trigger language plpgsql set search_path='' as $$
begin
 if new.owner_id is distinct from old.owner_id then raise exception 'immutable owner'; end if;return new;
end $$;
create trigger immutable_food_owner before update on public.foods for each row execute function public.prevent_owner_change();
-- Enforce snapshot and calendar rules for REST writes as well as our RPC.
create function public.snapshot_meal() returns trigger language plpgsql security invoker set search_path='' as $$
declare f public.foods; tz text;
begin
 select timezone into tz from public.profiles where user_id=new.user_id;
 new.local_date := (new.consumed_at at time zone coalesce(tz,'Asia/Tokyo'))::date;
 if TG_OP='UPDATE' then
  if new.user_id<>old.user_id then raise exception 'immutable user'; end if;
  -- Deleting a food only clears its FK; it must not destroy history.
  if new.food_id is null and old.food_id is not null and new.amount_g=old.amount_g then
   new.food_name_snapshot:=old.food_name_snapshot; new.source_snapshot:=old.source_snapshot;
   new.protein_g:=old.protein_g;new.fat_g:=old.fat_g;new.carbs_g:=old.carbs_g;new.calories_kcal:=old.calories_kcal;return new;
  end if;
  if new.food_id is not distinct from old.food_id and new.amount_g=old.amount_g then
   new.food_name_snapshot:=old.food_name_snapshot;new.source_snapshot:=old.source_snapshot;
   new.protein_g:=old.protein_g;new.fat_g:=old.fat_g;new.carbs_g:=old.carbs_g;new.calories_kcal:=old.calories_kcal;return new;
  end if;
 end if;
 if new.food_id is null then raise exception 'food required for recalculation'; end if;
 select * into f from public.foods where id=new.food_id;
 if not found then raise exception 'food not accessible'; end if;
 new.food_name_snapshot:=f.name;
 new.source_snapshot:=jsonb_build_object('source_type',f.source_type,'source_ref',f.source_ref,'source_version',f.source_version,'energy_basis',f.energy_basis);
 new.protein_g:=f.protein_100g*new.amount_g/100;new.fat_g:=f.fat_100g*new.amount_g/100;
 new.carbs_g:=f.carbs_100g*new.amount_g/100;new.calories_kcal:=f.kcal_100g*new.amount_g/100;
 return new;
end $$;
create trigger meal_snapshot before insert or update on public.meal_entries for each row execute function public.snapshot_meal();

create function public.initialize_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(user_id) values(new.id);
 insert into public.nutrition_targets(user_id,effective_from,protein_g,fat_g,carbs_g,calories_kcal) values(new.id,'0001-01-01',107,70,335,2400);
 return new;
end $$;
create trigger initialize_tracker after insert on auth.users for each row execute function public.initialize_user();
-- Also initialize accounts created before applying this migration.
insert into public.profiles(user_id) select id from auth.users on conflict do nothing;
insert into public.nutrition_targets(user_id,effective_from,protein_g,fat_g,carbs_g,calories_kcal)
 select id,'0001-01-01',107,70,335,2400 from auth.users on conflict do nothing;

create function public.tracker_data() returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 return jsonb_build_object(
 'foods',coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('portions',coalesce((select jsonb_agg(p) from public.food_portions p where p.food_id=f.id),'[]'::jsonb))) from public.foods f),'[]'::jsonb),
 'meals',coalesce((select jsonb_agg(m order by consumed_at desc) from public.meal_entries m),'[]'::jsonb),
 'targets',coalesce((select jsonb_agg(t order by effective_from desc) from public.nutrition_targets t),'[]'::jsonb),
 'favorites',coalesce((select jsonb_agg(food_id) from public.favorite_foods),'[]'::jsonb),
 'templates',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('items',coalesce((select jsonb_agg(i) from public.meal_template_items i where i.template_id=t.id),'[]'::jsonb))) from public.meal_templates t),'[]'::jsonb),
 'user_id',auth.uid());
end $$;

create function public.tracker_mutate(operation text,payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); fid uuid; tid uuid; item jsonb; entry public.meal_entries; n integer;
begin
 if uid is null then raise exception 'authentication required'; end if;
 case operation
 when 'food' then
  if payload->>'id' is null then
   insert into public.foods(owner_id,name,brand,protein_100g,fat_100g,carbs_100g,kcal_100g,source_type,source_ref,source_version,energy_basis)
   values(uid,payload->>'name',coalesce(payload->>'brand',''),(payload->>'protein')::numeric,(payload->>'fat')::numeric,(payload->>'carbs')::numeric,(payload->>'kcal')::numeric,payload->>'source_type',payload->>'source_ref',payload->>'source_version',payload->>'energy_basis') returning id into fid;
  else
   fid:=(payload->>'id')::uuid;
   update public.foods set name=payload->>'name',brand=payload->>'brand',protein_100g=(payload->>'protein')::numeric,fat_100g=(payload->>'fat')::numeric,carbs_100g=(payload->>'carbs')::numeric,kcal_100g=(payload->>'kcal')::numeric,source_type=payload->>'source_type',source_ref=payload->>'source_ref',source_version=payload->>'source_version',energy_basis=payload->>'energy_basis' where id=fid and owner_id=uid;
   if not found then raise exception 'not owned'; end if;
   delete from public.food_portions where food_id=fid;
  end if;
  if jsonb_array_length(payload->'portions')>20 then raise exception 'too many portions'; end if;
  for item in select * from jsonb_array_elements(payload->'portions') loop
   insert into public.food_portions(food_id,label,grams) values(fid,item->>'label',(item->>'grams')::numeric);
  end loop;
 when 'meal' then
  if payload->>'id' is null then
   insert into public.meal_entries(user_id,food_id,amount_g,consumed_at,local_date,meal_type,food_name_snapshot,protein_g,fat_g,carbs_g,calories_kcal)
   values(uid,(payload->>'food_id')::uuid,(payload->>'amount_g')::numeric,(payload->>'consumed_at')::timestamptz,current_date,payload->>'meal_type','',0,0,0,0);
  else
   update public.meal_entries set food_id=(payload->>'food_id')::uuid,amount_g=(payload->>'amount_g')::numeric,consumed_at=(payload->>'consumed_at')::timestamptz,meal_type=payload->>'meal_type' where id=(payload->>'id')::uuid and user_id=uid;
   if not found then raise exception 'not owned'; end if;
  end if;
 when 'delete_meal' then delete from public.meal_entries where id=(payload->>'id')::uuid and user_id=uid;
 when 'delete_food' then delete from public.foods where id=(payload->>'id')::uuid and owner_id=uid;
 when 'delete_template' then delete from public.meal_templates where id=(payload->>'id')::uuid and user_id=uid;
 when 'favorite' then
  if (payload->>'enabled')::boolean then insert into public.favorite_foods(user_id,food_id) values(uid,(payload->>'food_id')::uuid) on conflict do nothing;
  else delete from public.favorite_foods where user_id=uid and food_id=(payload->>'food_id')::uuid; end if;
 when 'target' then
  insert into public.nutrition_targets(user_id,effective_from,protein_g,fat_g,carbs_g,calories_kcal)
  values(uid,(payload->>'effective_from')::date,(payload->>'protein')::numeric,(payload->>'fat')::numeric,(payload->>'carbs')::numeric,(payload->>'kcal')::numeric)
  on conflict(user_id,effective_from) do update set protein_g=excluded.protein_g,fat_g=excluded.fat_g,carbs_g=excluded.carbs_g,calories_kcal=excluded.calories_kcal;
 when 'template' then
  n:=jsonb_array_length(payload->'items');if n is null or n<1 or n>50 then raise exception 'invalid template size'; end if;
  insert into public.meal_templates(user_id,name) values(uid,payload->>'name') returning id into tid;
  for item in select * from jsonb_array_elements(payload->'items') loop
   insert into public.meal_template_items(template_id,food_id,amount_g) values(tid,(item->>'food_id')::uuid,(item->>'amount_g')::numeric);
  end loop;
 when 'apply_template' then
  tid:=(payload->>'id')::uuid;
  if not exists(select 1 from public.meal_templates where id=tid and user_id=uid) then raise exception 'not owned'; end if;
  select count(*) into n from public.meal_template_items where template_id=tid;
  if n=0 then raise exception 'empty template'; end if;
  for item in select to_jsonb(i) from public.meal_template_items i where template_id=tid loop
   insert into public.meal_entries(user_id,food_id,amount_g,consumed_at,local_date,meal_type,food_name_snapshot,protein_g,fat_g,carbs_g,calories_kcal)
   values(uid,(item->>'food_id')::uuid,(item->>'amount_g')::numeric,(payload->>'consumed_at')::timestamptz,current_date,payload->>'meal_type','',0,0,0,0);
  end loop;
 else raise exception 'unknown operation';
 end case;
end $$;
-- Explicit least-privilege grants; anonymous users cannot call RPCs or access data.
revoke all on all tables in schema public from anon;
grant select,insert,update,delete on public.profiles,public.nutrition_targets,public.foods,public.food_portions,public.favorite_foods,public.meal_entries,public.meal_templates,public.meal_template_items to authenticated;
revoke all on function public.tracker_data(),public.tracker_mutate(text,jsonb),public.initialize_user(),public.snapshot_meal(),public.prevent_owner_change() from public,anon;
grant execute on function public.tracker_data(),public.tracker_mutate(text,jsonb) to authenticated;
