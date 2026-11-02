-- Run this once in the Supabase SQL Editor to enable central admin user management.
alter table public.profiles add column if not exists is_blocked boolean not null default false;
alter table public.profiles add column if not exists last_seen_at timestamptz;

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
revoke all on function public.admin_get_user_details(uuid) from public;
revoke all on function public.admin_save_user_workspace(uuid, jsonb, jsonb) from public;
revoke all on function public.admin_set_user_blocked(uuid, boolean) from public;
revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.admin_get_user_details(uuid) to authenticated;
grant execute on function public.admin_save_user_workspace(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.admin_set_user_blocked(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
