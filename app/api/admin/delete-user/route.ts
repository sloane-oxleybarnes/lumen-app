import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function DELETE(request: NextRequest) {
  const cookieStore = cookies()
  if (cookieStore.get('admin_auth')?.value !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userId, signupId } = await request.json()

  if (!signupId) {
    return NextResponse.json({ error: 'signupId required' }, { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Delete auth user if one exists (only applies to approved/invited users)
  if (userId) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) {
      console.error('deleteUser error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  // Remove from beta_signups
  const { error: deleteError } = await supabaseAdmin
    .from('beta_signups')
    .delete()
    .eq('id', signupId)

  if (deleteError) {
    console.error('beta_signups delete error:', deleteError)
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
