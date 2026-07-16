import { NextRequest, NextResponse } from 'next/server'
import { getAdaptiveAuth } from '@/lib/adaptive-auth'
import { initialAdaptiveState, type AdaptiveSnapshot } from '@/lib/openai-adaptive'

export async function GET() {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response

  const [{ data: sessions, error: sessionsError }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase
      .from('adaptive_conversation_sessions')
      .select('id, scenario_type, difficulty, status, setup_snapshot, transcript, assessment, created_at, updated_at, completed_at')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('contacts')
      .select('id, name, notes, relationship_type, relationship_other')
      .eq('user_id', session.user.id)
      .order('name', { ascending: true }),
  ])

  if (sessionsError) return NextResponse.json({ error: sessionsError.message }, { status: 500 })
  if (contactsError) return NextResponse.json({ error: contactsError.message }, { status: 500 })
  return NextResponse.json({ sessions: sessions || [], contacts: contacts || [] })
}

export async function POST(req: NextRequest) {
  const { supabase, session, response } = await getAdaptiveAuth()
  if (response || !session) return response

  const body = await req.json().catch(() => null) as Partial<AdaptiveSnapshot> & { approved?: boolean } | null
  if (!body?.approved) return NextResponse.json({ error: 'You must review and approve the simulation context.' }, { status: 400 })

  const scenarioType = body.scenarioType === 'contact' ? 'contact' : 'general'
  const person = body.person?.trim() || ''
  const situation = body.situation?.trim() || ''
  const goal = body.goal?.trim() || ''
  if (!person || !situation || !goal) {
    return NextResponse.json({ error: 'Person, situation, and goal are required.' }, { status: 400 })
  }

  let approvedContactContext = body.approvedContactContext?.trim() || ''
  if (scenarioType === 'contact') {
    if (!body.contactId) return NextResponse.json({ error: 'Choose a contact before continuing.' }, { status: 400 })
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, name, notes, relationship_type, relationship_other')
      .eq('id', body.contactId)
      .eq('user_id', session.user.id)
      .single()
    if (contactError || !contact) return NextResponse.json({ error: 'That contact is not available.' }, { status: 400 })
    if (!approvedContactContext) {
      approvedContactContext = [contact.relationship_type || contact.relationship_other, contact.notes]
        .filter(Boolean)
        .join('\n')
    }
  }

  const snapshot: AdaptiveSnapshot = {
    scenarioType,
    contactId: scenarioType === 'contact' ? body.contactId : null,
    person,
    situation,
    goal,
    concern: body.concern?.trim() || '',
    relationshipContext: body.relationshipContext?.trim() || '',
    personStyle: body.personStyle?.trim() || '',
    constraints: body.constraints?.trim() || '',
    approvedContactContext,
  }
  const { data, error } = await supabase
    .from('adaptive_conversation_sessions')
    .insert({
      user_id: session.user.id,
      contact_id: snapshot.contactId || null,
      scenario_type: scenarioType,
      difficulty: 'realistic',
      setup_snapshot: snapshot,
      simulation_state: initialAdaptiveState(snapshot),
      transcript: [],
      status: 'active',
    })
    .select('id, scenario_type, difficulty, status, setup_snapshot, transcript, assessment, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data }, { status: 201 })
}
