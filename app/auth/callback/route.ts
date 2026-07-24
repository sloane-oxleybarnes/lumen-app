import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/server-admin'
import { trackBetaEvent } from '@/lib/beta-events'
import { ensureApprovedBetaPlan, hasApprovedBetaAccess } from '@/lib/beta-access'
import { encryptGoogleAccessToken } from '@/lib/google-token-security'

function createCallbackClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          response.cookies.set(name, value, options as never)
        },
        remove(name: string, options: Record<string, unknown>) {
          response.cookies.set(name, '', options as never)
        },
      },
    }
  )
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type') as EmailOtpType | null
  const requestedNext = searchParams.get('next')
  const isPasswordAction = type === 'recovery' || type === 'invite'
  const next =
    requestedNext?.startsWith('/')
      ? requestedNext
      : isPasswordAction
        ? '/auth/set-password'
        : '/dashboard'
  const integration = searchParams.get('integration')
  const errorParam = searchParams.get('error')
  const errorDesc  = searchParams.get('error_description')

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(errorDesc || errorParam)}`, origin)
    )
  }

  // OAuth code exchange writes refreshed session cookies. A route handler must
  // attach those cookies to the response it returns; mutating the request cookie
  // store alone leaves the following dashboard request unauthenticated.
  const successResponse = NextResponse.redirect(
    new URL(isPasswordAction ? '/auth/set-password' : next, origin)
  )
  const supabase = createCallbackClient(request, successResponse)

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (data.session?.user && !isPasswordAction) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('plan')
          .eq('id', data.session.user.id)
          .maybeSingle()
        const approved = await hasApprovedBetaAccess({
          email: data.session.user.email,
          plan: profile?.plan,
        })
        if (!approved) {
          await supabase.auth.signOut()
          successResponse.headers.set(
            'Location',
            new URL('/beta?access=approval-required', origin).toString()
          )
          return successResponse
        }
        await ensureApprovedBetaPlan({
          userId: data.session.user.id,
          email: data.session.user.email,
          plan: profile?.plan,
        })
      }

      if ((integration === 'google' || integration === 'calendar') && data.session?.user) {
        if (!data.session.provider_token) {
          return NextResponse.redirect(
            new URL(`${next}?calendar=connection-token-missing`, origin)
          )
        }
        const now = new Date().toISOString()
        const isCalendarConnection = integration === 'calendar'
        await supabaseAdmin.from('user_integrations').upsert(
          {
            user_id: data.session.user.id,
            provider: isCalendarConnection ? 'google_calendar' : 'google',
            access_token: encryptGoogleAccessToken(data.session.provider_token),
            external_user_id: data.session.user.email || null,
            external_team_id: null,
            external_team_name: null,
            metadata: {
              provider: isCalendarConnection ? 'google_calendar' : 'google',
              email: data.session.user.email || null,
              scopes: isCalendarConnection
                ? 'calendar.events.readonly'
                : 'gmail.readonly',
              token_encryption: 'aes-256-gcm:v1',
            },
            connected_at: now,
            updated_at: now,
          },
          { onConflict: 'user_id,provider' }
        )

        await trackBetaEvent({
          userId: data.session.user.id,
          email: data.session.user.email,
          eventName: isCalendarConnection ? 'calendar_connected' : 'gmail_connected',
          source: 'web_app',
          metadata: { integration: isCalendarConnection ? 'calendar' : 'google' },
        })
      }

      return successResponse
    }
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, origin)
    )
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      // verifyOtp writes the authenticated session to successResponse. Returning a
      // fresh redirect here drops those cookies, which makes invite recipients look
      // signed out on the password-setup page and sends them back to login.
      return successResponse
    }
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, origin)
    )
  }

  return NextResponse.redirect(new URL('/auth/login', origin))
}
