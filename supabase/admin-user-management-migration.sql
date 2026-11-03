-- Run this once in the Supabase SQL Editor to enable central admin user management.
alter table public.profiles add column if not exists is_blocked boolean not null default false;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists subscription_started_at timestamptz;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;
alter table public.profiles add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Users can view profile avatars" on storage.objects;
drop policy if exists "Users can upload their profile avatar" on storage.objects;
drop policy if exists "Users can replace their profile avatar" on storage.objects;
create policy "Users can view profile avatars" on storage.objects
  for select to authenticated using (bucket_id = 'profile-avatars');
create policy "Users can upload their profile avatar" on storage.objects
  for insert to authenticated with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can replace their profile avatar" on storage.objects
  for update to authenticated using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.update_my_avatar(next_avatar_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if next_avatar_path is null or next_avatar_path !~ ('^' || auth.uid()::text || '/avatar\.(jpg|png|webp)$') then
    raise exception 'Invalid avatar path';
  end if;
  update public.profiles set avatar_path = next_avatar_path where id = auth.uid();
end;
$$;

-- Give paid accounts created before subscription tracking a fresh initial period.
-- This only affects rows that do not already have an expiry date.
update public.profiles
set
  subscription_started_at = coalesce(subscription_started_at, now()),
  subscription_expires_at = now() + case
    when plan = 'monthly' then interval '1 month'
    when plan = 'yearly' then interval '1 year'
  end
where plan in ('monthly', 'yearly')
  and subscription_expires_at is null;

create or replace function public.touch_last_seen()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set last_seen_at = now() where id = auth.uid();
end;
$$;

create or replace function public.admin_get_user_details(target_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select jsonb_build_object(
    'profile', to_jsonb(p),
    'workspace', jsonb_build_object(
      'languages', coalesce(w.languages, '[]'::jsonb),
      'questions', coalesce(w.questions, '{}'::jsonb)
    )
  ) into result
  from public.profiles p left join public.user_workspaces w on w.user_id = p.id
  where p.id = target_user_id and p.role = 'user';
  if result is null then raise exception 'User not found'; end if;
  return result;
end;
$$;

create or replace function public.admin_save_user_workspace(target_user_id uuid, next_languages jsonb, next_questions jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  insert into public.user_workspaces (user_id, languages, questions, updated_at)
  values (target_user_id, next_languages, next_questions, now())
  on conflict (user_id) do update set languages = excluded.languages, questions = excluded.questions, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.admin_set_user_blocked(target_user_id uuid, blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.profiles set is_blocked = blocked where id = target_user_id and role = 'user';
  if not found then raise exception 'User not found'; end if;
end;
$$;

-- Approving a monthly or yearly plan starts (or extends) that user's subscription.
create or replace function public.admin_review_user(target_user_id uuid, decision public.approval_state)
returns void language plpgsql security definer set search_path = public as $$
declare
  current_profile public.profiles%rowtype;
  is_upgrade boolean;
  next_plan public.subscription_plan;
  base_expiry timestamptz;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'Invalid review decision'; end if;

  select * into current_profile from public.profiles where id = target_user_id and role = 'user' for update;
  if not found then raise exception 'User not found'; end if;

  is_upgrade := current_profile.requested_plan is not null and current_profile.approval_status = 'approved';
  next_plan := case when is_upgrade and decision = 'approved' then current_profile.requested_plan else current_profile.plan end;

  if is_upgrade then
    update public.profiles set
      plan = next_plan,
      requested_plan = null,
      approval_status = 'approved',
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = target_user_id;
  else
    update public.profiles set
      approval_status = decision,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = target_user_id;
  end if;

  if decision = 'approved' and next_plan in ('monthly', 'yearly') then
    base_expiry := greatest(coalesce(current_profile.subscription_expires_at, now()), now());
    update public.profiles set
      subscription_started_at = coalesce(subscription_started_at, now()),
      subscription_expires_at = base_expiry + case when next_plan = 'monthly' then interval '1 month' else interval '1 year' end
    where id = target_user_id;
  end if;
end;
$$;

-- Deletes the Supabase Auth account and cascades to profiles/workspace.
create or replace function public.admin_delete_user(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  delete from auth.users where id = target_user_id and id <> auth.uid();
  if not found then raise exception 'User not found'; end if;
end;
$$;

revoke all on function public.touch_last_seen() from public;
revoke all on function public.update_my_avatar(text) from public;
revoke all on function public.admin_get_user_details(uuid) from public;
revoke all on function public.admin_save_user_workspace(uuid, jsonb, jsonb) from public;
revoke all on function public.admin_set_user_blocked(uuid, boolean) from public;
revoke all on function public.admin_review_user(uuid, public.approval_state) from public;
revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.update_my_avatar(text) to authenticated;
grant execute on function public.admin_get_user_details(uuid) to authenticated;
grant execute on function public.admin_save_user_workspace(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_set_user_blocked(uuid, boolean) to authenticated;
grant execute on function public.admin_review_user(uuid, public.approval_state) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
