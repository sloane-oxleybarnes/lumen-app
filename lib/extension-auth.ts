import { NextRequest } from 'next/server'
import { supabaseAdmin } from './server-admin'

export async function getExtensionUserId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  if (!token) return null
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('extension_token', token)
    .single()
  return data?.id ?? null
}

export async function getExtensionProfile(req: NextRequest): Promise<{ id: string; plan: string | null } | null> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  if (!token) return null

  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, plan')
    .eq('extension_token', token)
    .single()

  return data || null
}
