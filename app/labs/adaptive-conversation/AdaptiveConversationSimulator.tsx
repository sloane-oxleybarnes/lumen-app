'use client'

import { FormEvent, useEffect, useState } from 'react'

type Contact = { id: string; name: string; notes: string | null; relationship_type: string | null; relationship_other: string | null }
type Setup = {
  scenarioType: 'general' | 'contact'
  contactId: string
  person: string
  situation: string
  goal: string
  concern: string
  relationshipContext: string
  personStyle: string
  constraints: string
  approvedContactContext: string
}
type Message = { role: 'user' | 'simulated_person'; content: string; turn: number; createdAt: string }
type Assessment = {
  summary: string
  whatWorked: string[]
  turningPoints: string[]
  resistance: { increased: string[]; reduced: string[] }
  strongerResponse: string
  goalProgress: string
  replayPoint: { turn: number; why: string } | null
}
type SavedSession = { id: string; setup_snapshot: Setup; transcript: Message[]; assessment: Assessment | null; status: string; updated_at: string }

const blankSetup: Setup = {
  scenarioType: 'general', contactId: '', person: '', situation: '', goal: '', concern: '',
  relationshipContext: '', personStyle: '', constraints: '', approvedContactContext: '',
}

export default function AdaptiveConversationSimulator() {
  const [setup, setSetup] = useState<Setup>(blankSetup)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [stage, setStage] = useState<'setup' | 'review' | 'conversation' | 'assessment'>('setup')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [paused, setPaused] = useState(false)
  const [helpText, setHelpText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/labs/adaptive-conversation')
      .then((res) => res.json().then((body) => ({ res, body })))
      .then(({ res, body }) => {
        if (!res.ok) throw new Error(body.error || 'Could not load simulator.')
        setContacts(body.contacts || [])
        setSavedSessions(body.sessions || [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function updateSetup(field: keyof Setup, value: string) {
    setSetup((current) => ({ ...current, [field]: value }))
  }

  function selectContact(id: string) {
    const contact = contacts.find((item) => item.id === id)
    updateSetup('contactId', id)
    if (contact) {
      updateSetup('person', contact.name)
      updateSetup('approvedContactContext', [contact.relationship_type || contact.relationship_other, contact.notes].filter(Boolean).join('\n'))
    }
  }

  function reviewSetup(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!setup.person.trim() || !setup.situation.trim() || !setup.goal.trim()) {
      setError('Add the person, situation, and goal before reviewing the setup.')
      return
    }
    if (setup.scenarioType === 'contact' && !setup.contactId) {
      setError('Choose a contact before reviewing the setup.')
      return
    }
    setStage('review')
  }

  async function beginSimulation() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/labs/adaptive-conversation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...setup, approved: true }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not start the simulation.')
      setSessionId(body.session.id)
      setMessages([])
      setAssessment(null)
      setPaused(false)
      setHelpText('')
      setStage('conversation')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start the simulation.') }
    finally { setBusy(false) }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!sessionId || !input.trim() || busy || paused) return
    const message = input.trim()
    setInput('')
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/labs/adaptive-conversation/${sessionId}/turn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'The simulated person could not respond.')
      setMessages(body.transcript || [])
    } catch (err) { setError(err instanceof Error ? err.message : 'The simulated person could not respond.'); setInput(message) }
    finally { setBusy(false) }
  }

  async function askForHelp() {
    if (!sessionId || busy || messages.length < 2) return
    setBusy(true)
    setError('')
    setPaused(true)
    try {
      const res = await fetch(`/api/labs/adaptive-conversation/${sessionId}/help`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Help is unavailable right now.')
      setHelpText(body.help || '')
    } catch (err) { setError(err instanceof Error ? err.message : 'Help is unavailable right now.') }
    finally { setBusy(false) }
  }

  async function stopSimulation() {
    if (!sessionId || busy) return
    setBusy(true)
    try { await fetch(`/api/labs/adaptive-conversation/${sessionId}/stop`, { method: 'POST' }) }
    finally { setBusy(false); reset() }
  }

  async function finishSimulation() {
    if (!sessionId || messages.length < 2 || busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/labs/adaptive-conversation/${sessionId}/finish`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'The assessment could not be generated.')
      setAssessment(body.assessment)
      setStage('assessment')
      setSavedSessions((current) => current.map((item) => item.id === sessionId ? { ...item, assessment: body.assessment, status: 'completed', updated_at: new Date().toISOString() } : item))
    } catch (err) { setError(err instanceof Error ? err.message : 'The assessment could not be generated.') }
    finally { setBusy(false) }
  }

  function reset() { setSetup(blankSetup); setSessionId(null); setMessages([]); setAssessment(null); setPaused(false); setHelpText(''); setStage('setup'); setError('') }

  async function deleteSession(id: string) {
    if (!window.confirm('Delete this saved simulation and its transcript?')) return
    const res = await fetch(`/api/labs/adaptive-conversation/${id}`, { method: 'DELETE' })
    if (res.ok) setSavedSessions((current) => current.filter((item) => item.id !== id))
    else setError('That simulation could not be deleted.')
  }

  if (loading) return <main className="mx-auto max-w-5xl px-6 py-12 text-sm text-ink-mid">Loading the simulator…</main>

  return (
    <main className="min-h-screen bg-[#FBF8F3] px-5 py-8 text-ink sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Beckett Labs</p>
            <h1 className="mt-2 text-4xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Adaptive Conversation Simulator</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-mid">Practice one difficult conversation with a simulated person who can hesitate, misunderstand, push back, and change their mind.</p>
          </div>
          {stage !== 'setup' && <button onClick={reset} className="rounded-pill border border-border bg-white px-4 py-2 text-sm text-ink hover:border-primary">New simulation</button>}
        </div>

        {error && <div role="alert" className="mb-5 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        {stage === 'setup' && <section className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <form onSubmit={reviewSetup} className="rounded-card border border-border bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-light">Step 1</p>
            <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Set up the conversation</h2>
            <p className="mt-2 text-sm leading-6 text-ink-mid">Start with a general situation or a Beckett contact. You will approve the exact context before anything begins.</p>
            <div className="mt-6 flex gap-2">
              {(['general', 'contact'] as const).map((type) => <button key={type} type="button" onClick={() => updateSetup('scenarioType', type)} className={`rounded-pill px-4 py-2 text-sm ${setup.scenarioType === type ? 'bg-primary text-white' : 'border border-border bg-white text-ink-mid'}`}>{type === 'general' ? 'General scenario' : 'Existing contact'}</button>)}
            </div>
            {setup.scenarioType === 'contact' && <label className="mt-5 block text-sm font-medium">Contact<select value={setup.contactId} onChange={(e) => selectContact(e.target.value)} className="mt-2 block w-full rounded-card border border-border bg-white px-3 py-3 font-normal"><option value="">Choose a contact…</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Who are you talking to?" value={setup.person} onChange={(v) => updateSetup('person', v)} placeholder="e.g. my manager" />
              <Field label="Your goal" value={setup.goal} onChange={(v) => updateSetup('goal', v)} placeholder="What would a good outcome be?" />
            </div>
            <TextArea label="What is the situation?" value={setup.situation} onChange={(v) => updateSetup('situation', v)} placeholder="What needs to be discussed?" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What are you concerned about?" value={setup.concern} onChange={(v) => updateSetup('concern', v)} placeholder="Optional" />
              <Field label="Relationship context" value={setup.relationshipContext} onChange={(v) => updateSetup('relationshipContext', v)} placeholder="Optional" />
              <Field label="Their communication style" value={setup.personStyle} onChange={(v) => updateSetup('personStyle', v)} placeholder="Optional" />
              <Field label="Constraints or pressure" value={setup.constraints} onChange={(v) => updateSetup('constraints', v)} placeholder="Optional" />
            </div>
            <button type="submit" className="mt-6 rounded-pill bg-primary px-5 py-3 text-sm font-medium text-white hover:bg-primary-dark">Review setup →</button>
          </form>
          <aside className="rounded-card border border-primary/20 bg-primary-light/40 p-5 text-sm leading-6 text-ink-mid"><p className="font-medium text-primary">Realistic mode</p><p className="mt-2">The first version stays grounded: one plausible person, one conversation, and no automatic coaching while you are in role-play.</p><p className="mt-4">You can pause, ask for help, stop, or finish. The conversation may end with disagreement or uncertainty.</p></aside>
        </section>}

        {stage === 'review' && <section className="mx-auto max-w-3xl rounded-card border border-border bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-light">Step 2</p>
          <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Review and approve</h2>
          <p className="mt-2 text-sm leading-6 text-ink-mid">This is the session-specific context GPT‑5.6 will use. It will not change the permanent contact.</p>
          <div className="mt-6 space-y-4 rounded-card bg-[#FBF8F3] p-5 text-sm"><ReviewRow label="Person" value={setup.person} /><ReviewRow label="Situation" value={setup.situation} /><ReviewRow label="Goal" value={setup.goal} /><ReviewRow label="Concern" value={setup.concern || 'Not specified'} /><ReviewRow label="Relationship context" value={setup.relationshipContext || 'Not specified'} />{setup.scenarioType === 'contact' && <ReviewRow label="Approved contact context" value={setup.approvedContactContext || 'No additional context'} />}</div>
          <p className="mt-5 rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6 text-ink"><strong>Important:</strong> This is one plausible simulated response, not a prediction of how the real person will behave. New details introduced during role-play remain simulation-only.</p>
          <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => setStage('setup')} className="rounded-pill border border-border px-4 py-2 text-sm">Edit setup</button><button onClick={beginSimulation} disabled={busy} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Starting…' : 'Approve and begin →'}</button></div>
        </section>}

        {stage === 'conversation' && <section className="mx-auto max-w-3xl"><div className="mb-4 rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6"><strong>{setup.person}</strong> is simulated by GPT‑5.6. Stay in the conversation; ask for help or finish whenever you are ready.</div><div className="rounded-card border border-border bg-white p-5 shadow-sm"><div className="min-h-[360px] space-y-4">{messages.length === 0 && <p className="py-16 text-center text-sm text-ink-light">Start the conversation when you are ready.</p>}{messages.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-primary text-white' : 'bg-[#FBF8F3] text-ink'}`}><p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-60">{message.role === 'user' ? 'You' : setup.person}</p>{message.content}</div></div>)}</div>{helpText && <div className="mt-5 rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6"><p className="text-xs font-medium uppercase tracking-wide text-primary">Beckett’s pause note</p><p className="mt-2">{helpText}</p><button type="button" onClick={() => { setHelpText(''); setPaused(false) }} className="mt-3 text-xs font-medium text-primary hover:underline">Return to role-play</button></div>}<form onSubmit={sendMessage} className="mt-5 border-t border-border pt-4"><textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={paused ? 'Role-play is paused.' : `What do you say to ${setup.person}?`} rows={3} className="w-full resize-none rounded-card border border-border px-4 py-3 text-sm outline-none focus:border-primary" disabled={busy || paused} /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-ink-light">{messages.filter((m) => m.role === 'user').length} exchanges · {paused ? 'Paused' : 'Realistic mode'}</span><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPaused((value) => !value)} disabled={busy} className="rounded-pill border border-border px-3 py-2 text-xs">{paused ? 'Resume' : 'Pause'}</button><button type="button" onClick={askForHelp} disabled={busy || messages.length < 2} className="rounded-pill border border-primary/40 px-3 py-2 text-xs text-primary disabled:opacity-40">Ask for help</button><button type="button" onClick={stopSimulation} disabled={busy} className="rounded-pill border border-red-200 px-3 py-2 text-xs text-red-700">Stop</button><button type="button" onClick={finishSimulation} disabled={busy || messages.length < 2} className="rounded-pill border border-primary/40 px-3 py-2 text-xs text-primary disabled:opacity-40">{busy ? 'Working…' : 'Finish and assess'}</button><button type="submit" disabled={busy || paused || !input.trim()} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? 'Replying…' : 'Send'}</button></div></div></form></div></section>}

        {stage === 'assessment' && assessment && <AssessmentView assessment={assessment} onNew={reset} />}

        {stage === 'setup' && savedSessions.length > 0 && <section className="mt-8 rounded-card border border-border bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Saved simulations</p><h2 className="mt-1 text-xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Your recent practice</h2></div><p className="text-xs text-ink-light">Full transcripts are saved until you delete them.</p></div><div className="mt-4 divide-y divide-border">{savedSessions.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{item.setup_snapshot?.person || 'Conversation'}</p><p className="text-xs text-ink-light">{item.setup_snapshot?.situation || 'Saved simulation'} · {new Date(item.updated_at).toLocaleDateString()}</p></div><button onClick={() => deleteSession(item.id)} className="text-xs text-red-700 hover:underline">Delete</button></div>)}</div></section>}
      </div>
    </main>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="block text-sm font-medium">{label}<input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 block w-full rounded-card border border-border px-3 py-3 text-sm font-normal outline-none focus:border-primary" /></label> }
function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="mt-5 block text-sm font-medium">{label}<textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className="mt-2 block w-full resize-none rounded-card border border-border px-3 py-3 text-sm font-normal outline-none focus:border-primary" /></label> }
function ReviewRow({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-ink-light">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{value}</p></div> }
function AssessmentView({ assessment, onNew }: { assessment: Assessment; onNew: () => void }) { return <section className="mx-auto max-w-3xl"><div className="rounded-card border border-border bg-white p-6 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-primary">Conversation assessment</p><h2 className="mt-1 text-3xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>What this conversation showed</h2><p className="mt-4 text-sm leading-6 text-ink">{assessment.summary}</p><AssessmentList title="What worked" items={assessment.whatWorked} /><AssessmentList title="Turning points" items={assessment.turningPoints} /><div className="mt-6 grid gap-5 sm:grid-cols-2"><AssessmentList title="What increased resistance" items={assessment.resistance?.increased || []} /><AssessmentList title="What reduced resistance" items={assessment.resistance?.reduced || []} /></div><div className="mt-6 rounded-card bg-primary-light/40 p-4"><p className="text-xs font-medium uppercase tracking-wide text-primary">A stronger response</p><p className="mt-2 text-sm leading-6 text-ink">{assessment.strongerResponse}</p></div><div className="mt-5"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Progress toward your goal</p><p className="mt-2 text-sm leading-6 text-ink">{assessment.goalProgress}</p></div>{assessment.replayPoint && <div className="mt-5 rounded-card border border-border p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Optional replay point · exchange {assessment.replayPoint.turn}</p><p className="mt-2 text-sm leading-6 text-ink">{assessment.replayPoint.why}</p></div>}<button onClick={onNew} className="mt-7 rounded-pill bg-primary px-5 py-3 text-sm font-medium text-white">Start another simulation</button></div></section> }
function AssessmentList({ title, items }: { title: string; items: string[] }) { return <div className="mt-6"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">{title}</p>{items.length ? <ul className="mt-2 space-y-2 text-sm leading-6 text-ink">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className="text-primary">•</span><span>{item}</span></li>)}</ul> : <p className="mt-2 text-sm text-ink-light">Nothing notable here.</p>}</div> }
