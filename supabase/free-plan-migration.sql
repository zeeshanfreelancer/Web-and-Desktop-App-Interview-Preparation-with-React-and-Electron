-- Incremental migration that introduces the free plan and upgrade-request workflow.
-- Run this once if you already ran schema.sql before the Free plan was added.
alter type public.subscription_plan add value if not exists 'free';
alter table public.profiles add column if not exists requested_plan public.subscription_plan;
alter table public.profiles alter column plan set default 'free';

create policy "Free users can request an upgrade"
  on public.profiles for update to authenticated
  using (id = auth.uid() and role = 'user')
  with check (id = auth.uid() and role = 'user' and plan = 'free' and approval_status = 'approved' and requested_plan in ('monthly', 'yearly'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  selected_plan public.subscription_plan := coalesce((new.raw_user_meta_data ->> 'plan')::public.subscription_plan, 'free');
begin
  insert into public.profiles (id, full_name, email, plan, approval_status)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    selected_plan,
    case when selected_plan = 'free' then 'approved'::public.approval_state else 'pending'::public.approval_state end
  );
  return new;
end;
$$;
