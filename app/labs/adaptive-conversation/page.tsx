import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { hasApprovedBetaAccess } from '@/lib/beta-access'
import AdaptiveConversationSimulator from './AdaptiveConversationSimulator'

export default async function AdaptiveConversationPage() {
  const supabase = createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('plan').eq('id', session.user.id).maybeSingle()
  if (!(await hasApprovedBetaAccess({ email: session.user.email, plan: profile?.plan }))) {
    redirect('/beta?access=approval-required')
  }
  return <AdaptiveConversationSimulator />
}
