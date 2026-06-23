import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAnonKey, getSupabaseUrl } from './supabase-env'

export function createSupabaseServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: Record<string, unknown>) { cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]) },
        remove(name: string, options: Record<string, unknown>) { cookieStore.set(name, '', options as Parameters<typeof cookieStore.set>[2]) },
      },
    }
  )
}
