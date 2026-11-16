# Microsoft 365 sign-in and emergency master account

The app supports Microsoft Entra sign-in through Supabase's Azure OAuth provider.
`AUTH_MODE=m365` makes Microsoft sign-in the staff login and reserves password
access for one Supabase user UUID. Leave `AUTH_MODE` unset until setup and tests
are complete; existing password login continues to work during preparation.

## 1. Prepare the master account first

Create one confirmed email/password user in Supabase Authentication → Users,
or designate an existing user. Store its strong, unique password in your team's
password vault. Do not use this account for Microsoft login or link an Azure
identity to it. Record its Supabase **User UID**, not its email, as
`AUTH_MASTER_USER_ID`. The UUID prevents an email change from transferring
master access to a different user. The account has the same full workspace
access as staff; this app currently has no separate administrative role.

Test the account's password before proceeding. It is independent of Microsoft,
but still requires the application and Supabase Auth to be available.

## 2. Configure Entra and Supabase

Create a separate Entra app registration for Growth Desk sign-in, with accounts
in **this organisational directory only**. The existing mail-sending app and its
application Mail.Send permission are separate from interactive sign-in.

In Entra, add the Web redirect URI:

```text
https://<supabase-project-ref>.supabase.co/auth/v1/callback
```

Configure the optional `email` and `xms_edov` ID-token claims as described in
[Supabase's Microsoft setup guide](https://supabase.com/docs/guides/auth/social-login/auth-azure).
In the Entra Enterprise Application, set **Assignment required = Yes** and
assign only the staff/users/groups who should access Growth Desk. Tenant
membership by itself should not grant CRM access.

Enable the Azure provider in Supabase Authentication → Sign In / Providers.
Enter the sign-in app's client ID and client secret **value**, and set the Azure
Tenant URL to `https://login.microsoftonline.com/<your-tenant-id>`.
Do not use `/common`, `/organizations`, or `/consumers`.
Disable other OAuth providers, anonymous login, and manual identity linking.
Keep the Email provider enabled for the master account. Enable OAuth user
creation if assigned staff need their accounts created on first sign-in; the
token hook below denies ordinary email/password signup access.

In Supabase URL Configuration, set the production Site URL and allow exactly:

```text
https://<live-app-domain>/auth/callback
http://localhost:3000/auth/callback
```

Do not use broad production wildcard redirect URLs. Register secret expiry with
your normal operational reminder process and rotate before it expires.

## 3. Enforce the rule at Supabase, not only in the UI

Existing database policies permit authenticated users to access shared CRM data.
The app proxy alone cannot prevent someone from using the Supabase API directly.
Install a **Custom Access Token hook** before switching to SSO. This hook is
available on Free and Pro; the dedicated Password Verification hook requires
Teams or Enterprise. See [Supabase Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks).

Run the following in the Supabase SQL editor, replacing the placeholder with
the master user's actual UUID. This installs an invoker function, grants access
only to Supabase Auth, and issues the signed claim checked by the application.
It relies on the tenant-scoped Azure provider and disabled alternate providers
from step 2. Never use `user_metadata` to grant workspace access.

```sql
create or replace function public.growth_desk_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  master_id constant uuid := '<MASTER_USER_UUID>'::uuid;
  signing_in_user_id uuid := (event->>'user_id')::uuid;
  claims jsonb := event->'claims';
  auth_method text := event->>'authentication_method';
  has_password boolean;
  has_oauth boolean;
  has_azure_identity boolean;
  access_kind text;
begin
  select exists (
    select 1 from jsonb_array_elements(coalesce(claims->'amr', '[]'::jsonb)) as a
    where a->>'method' = 'password'
  ) into has_password;
  select exists (
    select 1 from jsonb_array_elements(coalesce(claims->'amr', '[]'::jsonb)) as a
    where a->>'method' = 'oauth'
  ) into has_oauth;

  if signing_in_user_id = master_id
     and auth_method in ('password', 'token_refresh', 'totp')
     and has_password and not has_oauth then
    access_kind := 'master';
  elsif signing_in_user_id <> master_id
     and auth_method in ('oauth', 'token_refresh', 'totp')
     and has_oauth and not has_password then
    select exists (
      select 1 from auth.identities i
      where i.user_id = signing_in_user_id and i.provider = 'azure'
    ) into has_azure_identity;
    if has_azure_identity then access_kind := 'm365'; end if;
  end if;

  if access_kind is null or coalesce((claims->>'is_anonymous')::boolean, false) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Use Microsoft 365. Password access is reserved for the master account.'
    ));
  end if;

  return jsonb_build_object('claims',
    jsonb_set(claims, '{growth_desk_access}', to_jsonb(access_kind), true)
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.growth_desk_access_token_hook(jsonb)
  to supabase_auth_admin;
revoke execute on function public.growth_desk_access_token_hook(jsonb)
  from public, anon, authenticated;
```

Select this function in Supabase Authentication → Hooks → Custom Access Token.
If another custom token hook is already active, merge this rule into that hook
instead of replacing its existing claims/logic.

The master must be provisioned through the administrative dashboard, not an
invite/magic-link login. Password resets for it are an administrator operation;
the hook rejects recovery and invite sessions. Do not enable this hook until
the master account already has a known, tested password.

Revoke pre-existing user sessions as part of the agreed cutover and allow
previously issued access tokens to expire before considering the policy fully
enforced. Hook changes affect newly issued tokens, not existing ones.

## 4. Enable the app

Set these server-side variables in local `.env.local` and the live hosting
environment (not `NEXT_PUBLIC_*`):

```env
AUTH_MODE=m365
AUTH_MASTER_USER_ID=<master-supabase-user-uuid>
M365_SSO_TENANT_ID=<entra-directory-tenant-uuid>
AUTH_APP_URL=https://<live-app-domain>
```

`M365_SSO_TENANT_ID` is a configuration readiness check in the app. Tenant
restriction is enforced by the Azure Tenant URL in Supabase and the single-tenant
registration in Entra; merely setting this variable does not configure Azure.
Client secrets belong in Supabase's provider settings, not source control.
`AUTH_APP_URL` supplies the canonical browser origin for callbacks and the
password form's same-origin check. Locally, use `http://localhost:3000`; Docker
development also recognises localhost directly. This avoids redirects to the
container's internal `0.0.0.0` hostname.

Redeploy the live app and recreate local Docker when changing environment
variables: `docker compose up -d --force-recreate`.

## 5. Verify before retiring existing login

In separate private browser sessions, check:

1. An assigned staff Microsoft account signs in, opens Companies/Quotes, and
   returns to the original page after a login redirect.
2. An unassigned user and a Microsoft account outside the tenant cannot sign in.
3. The master logs in through **Master account sign-in** with its password.
4. A staff account's existing password is denied both from the app and directly
   by Supabase Auth. Confirm the token hook is enabled.
5. Microsoft sign-in failure/cancellation shows a useful error and still lets
   the master password form open. Verify that form does not contact Microsoft.
6. Both staff and master sessions continue working after token refresh.
7. Supabase advisors report no exposed hook execution permissions or unintended
   grants. Keep a recovery Supabase administrator session available at cutover.

The app never adds extra privileges via a browser-supplied email or metadata.
After configuration, only the configured UUID can use the password path.
