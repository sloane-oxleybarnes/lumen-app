import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/server-admin'
import { trackBetaEvent } from '@/lib/beta-events'

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

  const supabase = createSupabaseServerClient()

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (integration === 'google' && data.session?.user) {
        const now = new Date().toISOString()
        await supabaseAdmin.from('user_integrations').upsert(
          {
            user_id: data.session.user.id,
            provider: 'google',
            access_token: data.session.provider_token || null,
            external_user_id: data.session.user.email || null,
            external_team_id: null,
            external_team_name: null,
            metadata: {
              provider: 'google',
              email: data.session.user.email || null,
              scopes: 'gmail.readonly calendar.readonly',
            },
            connected_at: now,
            updated_at: now,
          },
          { onConflict: 'user_id,provider' }
        )

        await trackBetaEvent({
          userId: data.session.user.id,
          email: data.session.user.email,
          eventName: 'gmail_connected',
          source: 'web_app',
          metadata: { integration: 'google' },
        })
      }

      return NextResponse.redirect(
        new URL(isPasswordAction ? '/auth/set-password' : next, origin)
      )
    }
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, origin)
    )
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(
        new URL(isPasswordAction ? '/auth/set-password' : next, origin)
      )
    }
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, origin)
    )
  }

  return NextResponse.redirect(new URL('/auth/login', origin))
}
