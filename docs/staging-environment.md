# Beckett staging environment

Use the `staging` branch for major product, backend, admin, course, and extension experiments while `main` stays tied to live beta.

## Vercel preview setup

1. Create or use the Vercel Preview deployment for the `staging` branch.
2. Add the variables from `.env.staging.example` to the Vercel Preview environment.
3. Set `NEXT_PUBLIC_APP_ENV=staging` and `APP_ENV=staging`.
4. Keep `ENABLE_STAGING_EMAILS=false` unless you intentionally want staging to send beta emails or Loops events.
5. Use a staging-specific `NEXT_PUBLIC_SITE_URL`, for example `https://beckett-staging.vercel.app` or a custom staging subdomain.

The app shows a visible staging banner whenever the deployment is staging-like. Lifecycle emails and Loops events are blocked by default in staging, Vercel preview, and local development.

## Supabase staging setup

1. Create a separate Supabase project named `Beckett Staging`.
2. Apply every SQL migration in `supabase/migrations` in filename order, starting with `20260601_base_schema.sql`.
3. Use the staging project URL, anon key, and service role key in Vercel Preview.
4. Configure Auth URL and redirects for:
   - the staging site URL
   - `http://localhost:3000`
   - `/auth/callback`
   - `/auth/set-password`
   - `/auth/extension-connect`

Do not point staging at the production Supabase project unless you are intentionally testing against beta data.

If Supabase shows `relation "beta_signups" does not exist`, the base schema has not been run yet. Run `20260601_base_schema.sql` first, then continue with `20260602_add_approved_to_beta_signups.sql` and the rest of the migration files in order.

## Local staging extension

The Chrome Web Store package remains unchanged. For staging-only extension testing:

```bash
BECKETT_STAGING_SITE_URL=https://your-staging-url.vercel.app npm run package:extension:staging
```

Then open Chrome Extensions, enable Developer Mode, choose **Load unpacked**, and select:

```text
dist/beckett-extension-staging
```

This local build is named `Beckett Staging` and rewrites the copied extension package to call the staging site/API. Do not submit this staging package to the Chrome Web Store.

## Promotion workflow

1. Build experimental features on `staging`.
2. Test with staging users and staging Supabase data only.
3. When ready, merge or cherry-pick approved changes into `main`.
4. Apply production migrations intentionally.
5. Deploy production beta from `main`.
