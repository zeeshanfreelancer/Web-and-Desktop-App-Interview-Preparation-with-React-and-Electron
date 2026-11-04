# Interview Prep Notes

## Push Update to GitHub Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Set Password Expiration

Run password commands from the `desktop` folder:

```bash
cd desktop
```

First time only, generate license signing keys:

```bash
npm run add-password -- init
```

Add a password with an expiration date:

```bash
npm run add-password -- add --password "UserPass123" --expires "2026-12-31" --label "John"
```

This password will expire at the end of the selected date, at `23:59`.

Example:

```bash
npm run add-password -- add --password "Client2026" --expires "2026-09-30" --label "Client A"
```

## Set Password Expiration With Hour and Minute

Use this format:

```text
YYYY-MM-DD HH:mm
```

Example:

```bash
npm run add-password -- add --password "Client2026" --expires "2026-09-30 18:30" --label "Client A"
```

This password will expire exactly at `18:30` local time on `2026-09-30`.

You can also use `T` instead of a space:

```bash
npm run add-password -- add --password "Client2026" --expires "2026-09-30T18:30" --label "Client A"
```

Update an existing password expiration by running the same command again with the same password and a new date or time:

```bash
npm run add-password -- add --password "Client2026" --expires "2027-01-31 09:15" --label "Client A"
```

List saved passwords:

```bash
npm run add-password -- list
```

Remove a password:

```bash
npm run add-password -- remove --password "UserPass123"
```

## Apply Password Changes

After adding, updating, or removing a password, this file is regenerated:

```text
desktop/license/licenses.manifest.json
```

If remote license sync is enabled, upload the updated `licenses.manifest.json` to GitHub.

If remote license sync is not enabled, rebuild and release the app so the new password expiration is included.

Do not upload or share:

```text
desktop/license/private.pem
desktop/license/passwords.json
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