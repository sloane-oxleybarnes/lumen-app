import { createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  const supabase = createSupabaseServerClient()

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
    return NextResponse.redirect(`${origin}/dashboard`)
  }

  if (token_hash && type) {
    await supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType })
    // Invite flow — send to set-password before dashboard
    if (type === 'invite') {
      return NextResponse.redirect(`${origin}/auth/set-password`)
    }
    return NextResponse.redirect(`${origin}/dashboard`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
