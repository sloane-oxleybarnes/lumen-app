import { createClient } from '@supabase/supabase-js'
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './supabase-env'

export const supabaseAdmin = createClient(
  getSupabaseUrl(),
  getSupabaseServiceRoleKey()
)
