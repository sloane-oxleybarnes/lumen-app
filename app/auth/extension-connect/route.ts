import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/server-admin'

function isAllowedRedirect(uri: string) {
  try {
    const parsed = new URL(uri)
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.chromiumapp.org')
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const redirectUri = req.nextUrl.searchParams.get('redirect_uri')
  if (!redirectUri || !isAllowedRedirect(redirectUri)) {
    return NextResponse.json({ error: 'Invalid extension redirect URI.' }, { status: 400 })
  }

  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    const login = new URL('/auth/login', req.url)
    login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
    return NextResponse.redirect(login)
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, first_name, display_name, plan, extension_token')
    .eq('id', session.user.id)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  let token = profile.extension_token as string | null
  if (!token) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ extension_token: crypto.randomUUID() })
      .eq('id', session.user.id)
      .select('extension_token')
      .single()

    if (updateError || !updated?.extension_token) {
      return NextResponse.json({ error: 'Could not create extension token.' }, { status: 500 })
    }
    token = updated.extension_token
  }

  const target = new URL(redirectUri)
  target.searchParams.set('token', token as string)
  target.searchParams.set('plan', profile.plan || 'beta')
  if (profile.display_name || profile.first_name || profile.full_name) {
    target.searchParams.set('name', profile.display_name || profile.first_name || profile.full_name)
  }
  if (profile.email) target.searchParams.set('email', profile.email)
  return NextResponse.redirect(target)
}
