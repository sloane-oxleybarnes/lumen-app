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
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType })
    if (type === 'invite') {
      if (!error && data.session) {
        const url = new URL(`${origin}/auth/set-password`)
        url.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=invite`
        return NextResponse.redirect(url.toString())
      }
      return NextResponse.redirect(`${origin}/auth/set-password`)
    }
    return NextResponse.redirect(`${origin}/dashboard`)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
