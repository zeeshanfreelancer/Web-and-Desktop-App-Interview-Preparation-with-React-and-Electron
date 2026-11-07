# Interview Prep Notes

## Push Update to GitHub Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

begin;

-- Delete all registered users and their Auth-related records.
delete from auth.users;

-- Delete all app tables, functions, types, RLS policies, and data.
drop schema if exists public cascade;
create schema public;

-- Restore the permissions needed by Supabase clients.
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

commit;


check admin:

select email, full_name, role
from public.profiles
where role = 'admin';

make admin:

update public.profiles
set
  role = 'admin',
  approval_status = 'approved',
  reviewed_at = now()
where email = 'your-admin-email@example.com';
