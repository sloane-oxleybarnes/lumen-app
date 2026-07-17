'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import type { AdaptiveAssessment, AdaptiveReplay, AdaptiveSnapshot, AdaptiveTranscriptItem } from '@/lib/adaptive-conversation'

type Contact = { id: string; name: string; notes: string | null; relationship_type: string | null; relationship_other: string | null }
type Setup = Omit<AdaptiveSnapshot, 'contactId'> & {
  scenarioType: 'general' | 'contact'
  contactId: string
}
type Message = AdaptiveTranscriptItem
type Assessment = AdaptiveAssessment
type SavedSession = { id: string; setup_snapshot: Setup; transcript: Message[]; assessment: Assessment | null; status: string; updated_at: string }

const blankSetup: Setup = {
  scenarioType: 'general', channel: 'text', difficulty: 'realistic', contactId: '', person: '', situation: '', goal: '', concern: '',
  relationshipContext: '', personStyle: '', constraints: '', approvedContactContext: '',
}

export default function AdaptiveConversationSimulator() {
  const [setup, setSetup] = useState<Setup>(blankSetup)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [assessmentLoading, setAssessmentLoading] = useState(false)
  const [stage, setStage] = useState<'setup' | 'review' | 'conversation' | 'assessment' | 'replay'>('setup')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [typing, setTyping] = useState(false)
  const [paused, setPaused] = useState(false)
  const [helpText, setHelpText] = useState('')
  const [endReason, setEndReason] = useState('')
  const [replay, setReplay] = useState<AdaptiveReplay | null>(null)
  const [replayInput, setReplayInput] = useState('')
  const [replayBusy, setReplayBusy] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [audioError, setAudioError] = useState('')
  const spokenMessageRef = useRef('')
  const lastVoiceTranscriptRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (setup.channel !== 'video') return
    const latest = [...messages].reverse().find((message) => message.role === 'simulated_person')
    if (!latest || latest.content === spokenMessageRef.current || typeof window === 'undefined') return
    spokenMessageRef.current = latest.content
    if (!('speechSynthesis' in window)) {
      setAudioError('Spoken playback is unavailable in this browser. Use the live captions and text fallback below.')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(latest.content)
    utterance.onstart = () => { setSpeaking(true); setAudioError('') }
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => { setSpeaking(false); setAudioError('Audio playback failed. Continue with the live captions and text fallback below.') }
    window.speechSynthesis.speak(utterance)
    return () => window.speechSynthesis.cancel()
  }, [messages, setup.channel])
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
      setReplay(null)
      setSpeaking(false)
      setAudioError('')
      spokenMessageRef.current = ''
      lastVoiceTranscriptRef.current = {}
      setPaused(false)
      setHelpText('')
      setTyping(false)
      setEndReason('')
      setStage('conversation')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start the simulation.') }
    finally { setBusy(false) }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!sessionId || !input.trim() || busy || paused) return
    const message = input.trim()
    const previousMessages = messages
    const optimisticMessage: Message = {
      role: 'user',
      content: message,
      turn: messages.filter((item) => item.role === 'user').length + 1,
      createdAt: new Date().toISOString(),
    }
    setInput('')
    setMessages([...messages, optimisticMessage])
    setBusy(true)
    setTyping(true)
    setError('')
    try {
      const res = await fetch(`/api/labs/adaptive-conversation/${sessionId}/turn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'The simulated person could not respond.')
      setMessages(body.transcript || [])
      if (body.conversationStatus === 'ended' || body.conversationStatus === 'ending') {
        setEndReason(body.endReason || 'The conversation has reached a natural stopping point.')
      }
    } catch (err) { setMessages(previousMessages); setError(err instanceof Error ? err.message : 'The simulated person could not respond.'); setInput(message) }
    finally { setBusy(false); setTyping(false) }
  }

  async function saveVoiceTranscript(role: 'user' | 'simulated_person', content: string) {
    const key = `${role}:${content.trim()}`
    const nowMs = Date.now()
    if (nowMs - (lastVoiceTranscriptRef.current[key] || 0) < 2500) return
    lastVoiceTranscriptRef.current[key] = nowMs
    const item: Message = { role, content, turn: role === 'user' ? messages.filter((message) => message.role === 'user').length + 1 : Math.max(1, messages.filter((message) => message.role === 'user').length), createdAt: new Date().toISOString() }
    setMessages((current) => [...current, item])
    if (sessionId) await fetch(`/api/labs/adaptive-conversation/${sessionId}/realtime/transcript`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, content }) })
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
    setAssessment(null)
    setAssessmentLoading(true)
    setStage('assessment')
    try {
      const res = await fetch(`/api/labs/adaptive-conversation/${sessionId}/finish`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'The assessment could not be generated.')
      setAssessment(body.assessment)
      setSavedSessions((current) => current.map((item) => item.id === sessionId ? { ...item, assessment: body.assessment, status: 'completed', updated_at: new Date().toISOString() } : item))
    } catch (err) { setError(err instanceof Error ? err.message : 'The assessment could not be generated.'); setStage('conversation') }
    finally { setBusy(false); setAssessmentLoading(false) }
  }

  function startReplay() {
    setReplayInput('')
    setError('')
    setStage('replay')
  }

  async function sendReplay(event: FormEvent) {
    event.preventDefault()
    if (!sessionId || !replayInput.trim() || replayBusy || !assessment?.replayPoint) return
    setReplayBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/labs/adaptive-conversation/${sessionId}/replay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replayInput.trim(), ...(replay ? {} : { turn: assessment.replayPoint.turn }) }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'The replay could not respond.')
      setReplay(body.replay)
      setReplayInput('')
    } catch (err) { setError(err instanceof Error ? err.message : 'The replay could not respond.') }
    finally { setReplayBusy(false) }
  }

  function reset() { setSetup(blankSetup); setSessionId(null); setMessages([]); setAssessment(null); setAssessmentLoading(false); setReplay(null); setReplayInput(''); setPaused(false); setHelpText(''); setEndReason(''); setSpeaking(false); setAudioError(''); spokenMessageRef.current = ''; lastVoiceTranscriptRef.current = {}; setStage('setup'); setError('') }

  async function deleteSession(id: string) {
    if (!window.confirm('Delete this saved simulation and its transcript?')) return
    const res = await fetch(`/api/labs/adaptive-conversation/${id}`, { method: 'DELETE' })
    if (res.ok) setSavedSessions((current) => current.filter((item) => item.id !== id))
    else setError('That simulation could not be deleted.')
  }

  function retrySession(item: SavedSession) {
    const snapshot = item.setup_snapshot
    setSetup({
      ...blankSetup,
      ...snapshot,
      scenarioType: snapshot.scenarioType === 'contact' ? 'contact' : 'general',
      channel: snapshot.channel || 'text',
      difficulty: snapshot.difficulty || 'realistic',
      contactId: snapshot.contactId || '',
    })
    setSessionId(null)
    setMessages([])
    setAssessment(null)
    setReplay(null)
    setError('')
    setStage('review')
  }

  if (loading) return <main className="mx-auto max-w-5xl px-6 py-12 text-sm text-ink-mid">Loading the simulator…</main>

  const replayMessages = assessment?.replayPoint ? messages.filter((message) => message.turn === assessment.replayPoint?.turn) : []

  return (
    <main className="min-h-screen bg-[#FBF8F3] px-5 py-8 text-ink sm:px-8">
      <style>{`@media (min-width: 768px) { section[class*="rounded-[2rem]"] { display: grid; grid-template-columns: 1fr 1fr; } section[class*="rounded-[2rem]"] > div:first-child { min-height: 100%; } section[class*="rounded-[2rem]"] > div:nth-child(2) { display: flex; flex-direction: column; justify-content: center; } }`}</style>
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

        {stage === 'replay' && assessment?.replayPoint && <div className="mx-auto mb-4 max-w-3xl rounded-card border border-primary/20 bg-primary-light/30 p-5"><p className="text-xs font-medium uppercase tracking-wide text-primary">Original exchange {assessment.replayPoint.turn}</p>{replayMessages.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`mt-3 rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'ml-8 bg-primary text-white' : 'mr-8 bg-white text-ink'}`}><p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-60">{message.role === 'user' ? 'You originally said' : setup.person}</p>{message.content}</div>)}<p className="mt-3 text-xs text-ink-light">Your alternate response will replace your original message at this moment.</p></div>}

        {stage === 'setup' && <section className="mx-auto max-w-3xl">
          <form onSubmit={reviewSetup} className="rounded-card border border-border bg-white p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-light">Step 1</p>
            <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Set up the conversation</h2>
            <p className="mt-2 text-sm leading-6 text-ink-mid">Start with a general situation or a Beckett contact. You will approve the exact context before anything begins.</p>
            <div className="mt-6 flex gap-2">
              {(['general', 'contact'] as const).map((type) => <button key={type} type="button" onClick={() => updateSetup('scenarioType', type)} className={`rounded-pill px-4 py-2 text-sm ${setup.scenarioType === type ? 'bg-primary text-white' : 'border border-border bg-white text-ink-mid'}`}>{type === 'general' ? 'General scenario' : 'Existing contact'}</button>)}
            </div>
            <div className="mt-5"><p className="text-sm font-medium">Practice channel</p><div className="mt-2 flex flex-wrap gap-2">{(['text', 'phone', 'video'] as const).map((channel) => <button key={channel} type="button" onClick={() => updateSetup('channel', channel)} className={`rounded-pill px-4 py-2 text-sm ${setup.channel === channel ? 'bg-primary text-white' : 'border border-border bg-white text-ink-mid'}`}>{channel === 'text' ? 'Text conversation' : channel === 'phone' ? 'Phone call' : 'Video call'}</button>)}</div><p className="mt-2 text-xs text-ink-light">Video mode is a modest call layout with optional camera, microphone capture, live captions, and spoken playback. Text remains available if audio fails.</p></div>
            <div className="mt-5"><p className="text-sm font-medium">Simulation mode</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{(['realistic', 'supportive', 'challenging'] as const).map((difficulty) => <button key={difficulty} type="button" onClick={() => updateSetup('difficulty', difficulty)} className={`rounded-card border px-3 py-3 text-left ${setup.difficulty === difficulty ? 'border-primary bg-primary-light/40' : 'border-border bg-white'}`}><span className="block text-sm font-medium capitalize">{difficulty}</span><span className="mt-1 block text-xs leading-5 text-ink-light">{difficulty === 'realistic' ? 'Balanced and plausible.' : difficulty === 'supportive' ? 'More patient, still authentic.' : 'More guarded, never hostile.'}</span></button>)}</div></div>
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
        </section>}

        {stage === 'conversation' && endReason && <div className="mx-auto mb-4 max-w-3xl rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6"><p className="text-xs font-medium uppercase tracking-wide text-primary">Natural stopping point</p><p className="mt-2">{endReason}</p><p className="mt-2 text-xs text-ink-light">You can finish and assess this conversation, including if it ended with disagreement or ambiguity.</p></div>}
        {stage === 'conversation' && setup.channel !== 'video' && <p className="mx-auto mb-2 max-w-3xl text-xs text-ink-light">{setup.channel === 'phone' ? 'Phone call' : 'Text conversation'} · <span className="capitalize">{setup.difficulty}</span> mode</p>}

        {stage === 'conversation' && (setup.channel === 'video' || setup.channel === 'phone') && <VideoCallFrame sessionId={sessionId} person={setup.person} messages={messages} typing={typing} speaking={speaking} audioError={audioError} input={input} setInput={setInput} onSubmit={sendMessage} onVoiceTranscript={saveVoiceTranscript} onEnd={finishSimulation} disabled={busy || paused || Boolean(endReason)} channel={setup.channel} />}

        {stage === 'review' && <section className="mx-auto max-w-3xl rounded-card border border-border bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-light">Step 2</p>
          <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Review and approve</h2>
          <p className="mt-2 text-sm leading-6 text-ink-mid">This is the session-specific context GPT‑5.6 will use. It will not change the permanent contact.</p>
          <div className="mt-6 space-y-4 rounded-card bg-[#FBF8F3] p-5 text-sm"><ReviewRow label="Practice channel" value={setup.channel === 'phone' ? 'Phone call' : 'Text conversation'} /><ReviewRow label="Person" value={setup.person} /><ReviewRow label="Situation" value={setup.situation} /><ReviewRow label="Goal" value={setup.goal} /><ReviewRow label="Concern" value={setup.concern || 'Not specified'} /><ReviewRow label="Relationship context" value={setup.relationshipContext || 'Not specified'} />{setup.scenarioType === 'contact' && <ReviewRow label="Approved contact context" value={setup.approvedContactContext || 'No additional context'} />}</div>
          <p className="mt-5 rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6 text-ink"><strong>Important:</strong> This is one plausible simulated response, not a prediction of how the real person will behave. New details introduced during role-play remain simulation-only.</p>
          <p className="mt-3 text-xs text-ink-light">Mode: <span className="font-medium capitalize">{setup.difficulty}</span> · This changes the person’s level of patience and resistance, not the underlying scenario.</p>
          <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => setStage('setup')} className="rounded-pill border border-border px-4 py-2 text-sm">Edit setup</button><button onClick={beginSimulation} disabled={busy} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Starting…' : 'Approve and begin →'}</button></div>
        </section>}

        {stage === 'conversation' && setup.channel === 'text' && <section className="mx-auto max-w-3xl"><div className="mb-4 rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6"><strong>{setup.person}</strong> is simulated by GPT‑5.6 in a text conversation. Stay in the conversation; ask for help or finish whenever you are ready.</div><div className="rounded-card border border-border bg-white p-5 shadow-sm"><div className="min-h-[360px] space-y-4">{messages.length === 0 && <p className="py-16 text-center text-sm text-ink-light">Start the conversation when you are ready.</p>}{messages.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-primary text-white' : 'bg-[#FBF8F3] text-ink'}`}><p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-60">{message.role === 'user' ? 'You' : setup.person}</p>{message.content}</div></div>)}{typing && <div className="flex justify-start" aria-live="polite"><div className="rounded-2xl bg-[#FBF8F3] px-4 py-3 text-sm text-ink-mid"><span className="mr-2 text-[10px] font-medium uppercase tracking-wide text-ink-light">{setup.person} is responding</span><span className="inline-flex gap-1 align-middle"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-light" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-light [animation-delay:150ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-light [animation-delay:300ms]" /></span></div></div>}</div>{helpText && <div className="mt-5 rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6"><p className="text-xs font-medium uppercase tracking-wide text-primary">Beckett’s pause note</p><p className="mt-2">{helpText}</p><button type="button" onClick={() => { setHelpText(''); setPaused(false) }} className="mt-3 text-xs font-medium text-primary hover:underline">Return to role-play</button></div>}<form onSubmit={sendMessage} className="mt-5 border-t border-border pt-4"><textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={paused ? 'Role-play is paused.' : 'What would you like to say?'} rows={3} className="w-full resize-none rounded-card border border-border px-4 py-3 text-sm outline-none focus:border-primary" disabled={busy || paused} /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-ink-light">{messages.filter((m) => m.role === 'user').length} exchanges · {paused ? 'Paused' : `${setup.difficulty} mode`}</span><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPaused((value) => !value)} disabled={busy} className="rounded-pill border border-border px-3 py-2 text-xs">{paused ? 'Resume' : 'Pause'}</button><button type="button" onClick={askForHelp} disabled={busy || messages.length < 2} className="rounded-pill border border-primary/40 px-3 py-2 text-xs text-primary disabled:opacity-40">Ask for help</button><button type="button" onClick={stopSimulation} disabled={busy} className="rounded-pill border border-red-200 px-3 py-2 text-xs text-red-700">Stop</button><button type="button" onClick={finishSimulation} disabled={busy || messages.length < 2} className="rounded-pill border border-primary/40 px-3 py-2 text-xs text-primary disabled:opacity-40">{busy ? 'Working…' : 'Finish and assess'}</button><button type="submit" disabled={busy || paused || !input.trim()} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? 'Replying…' : 'Send'}</button></div></div></form></div></section>}

        {stage === 'assessment' && assessmentLoading && <section className="mx-auto max-w-3xl rounded-card border border-border bg-white p-8 text-center shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-primary">Conversation ended</p><h2 className="mt-2 text-3xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Preparing your debrief…</h2><p className="mt-3 text-sm leading-6 text-ink-mid">The role-play is finished. Beckett is reviewing the transcript for turning points, resistance, goal progress, and a useful replay point.</p><div className="mx-auto mt-6 h-2 max-w-xs overflow-hidden rounded-pill bg-primary-light"><div className="h-full w-1/2 animate-pulse rounded-pill bg-primary" /></div></section>}
        {stage === 'assessment' && assessment && <AssessmentView assessment={assessment} onNew={reset} onReplay={startReplay} />}

        {stage === 'replay' && assessment?.replayPoint && <section className="mx-auto max-w-3xl"><div className="rounded-card border border-border bg-white p-6 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-primary">Replay a turning point</p><h2 className="mt-1 text-3xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Try the moment again</h2><p className="mt-3 text-sm leading-6 text-ink-mid">The original session is preserved. You are restoring the conversation immediately before exchange {assessment.replayPoint.turn}; your next response will create a separate branch.</p>{replay && <div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-card bg-[#FBF8F3] p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Original trajectory</p><p className="mt-2 text-sm font-medium capitalize">{replay.originalTrajectory}</p><p className="mt-2 text-sm leading-6 text-ink-mid">{replay.originalOutcome}</p></div><div className="rounded-card border border-primary/20 bg-primary-light/30 p-4"><p className="text-xs font-medium uppercase tracking-wide text-primary">Replay trajectory</p><p className="mt-2 text-sm font-medium capitalize">{replay.replayTrajectory}</p><p className="mt-2 text-sm leading-6 text-ink-mid">{replay.replayOutcome}</p></div></div>}{replay && <div className="mt-6 space-y-3 border-t border-border pt-5">{replay.transcript.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-primary text-white' : 'bg-[#FBF8F3] text-ink'}`}><p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-60">{message.role === 'user' ? 'Your replay' : setup.person}</p>{message.content}</div></div>)}</div>}<form onSubmit={sendReplay} className="mt-6 border-t border-border pt-5"><label className="text-sm font-medium">{replay ? 'Continue the replay' : `What would you say differently to ${setup.person}?`}<textarea value={replayInput} onChange={(e) => setReplayInput(e.target.value)} rows={4} placeholder={setup.channel === 'phone' ? 'What would you say out loud?' : 'Try a different response…'} className="mt-2 w-full resize-none rounded-card border border-border px-4 py-3 text-sm outline-none focus:border-primary" disabled={replayBusy} /></label><div className="mt-3 flex justify-between gap-3"><button type="button" onClick={() => setStage('assessment')} className="rounded-pill border border-border px-4 py-2 text-sm">Back to assessment</button><button type="submit" disabled={replayBusy || !replayInput.trim()} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{replayBusy ? 'Replaying…' : replay ? 'Continue replay' : 'Try this response →'}</button></div></form></div></section>}

        {stage === 'setup' && savedSessions.length > 0 && <section className="mt-8 rounded-card border border-border bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Saved simulations</p><h2 className="mt-1 text-xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Your recent practice</h2></div><p className="text-xs text-ink-light">Full transcripts are saved until you delete them.</p></div><div className="mt-4 divide-y divide-border">{savedSessions.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{item.setup_snapshot?.person || 'Conversation'}</p><p className="text-xs text-ink-light">{item.setup_snapshot?.situation || 'Saved simulation'} · {new Date(item.updated_at).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><button onClick={() => retrySession(item)} className="text-xs font-medium text-primary hover:underline">Retry this situation</button><button onClick={() => deleteSession(item.id)} className="text-xs text-red-700 hover:underline">Delete</button></div></div>)}</div></section>}
      </div>
    </main>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="block text-sm font-medium">{label}<input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 block w-full rounded-card border border-border px-3 py-3 text-sm font-normal outline-none focus:border-primary" /></label> }
function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="mt-5 block text-sm font-medium">{label}<textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className="mt-2 block w-full resize-none rounded-card border border-border px-3 py-3 text-sm font-normal outline-none focus:border-primary" /></label> }
function ReviewRow({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-ink-light">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{value}</p></div> }
function AssessmentView({ assessment, onNew, onReplay }: { assessment: Assessment; onNew: () => void; onReplay: () => void }) { return <section className="mx-auto max-w-3xl"><div className="rounded-card border border-border bg-white p-6 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-primary">Conversation assessment</p><h2 className="mt-1 text-3xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>What this conversation showed</h2><p className="mt-4 text-sm leading-6 text-ink">{assessment.summary}</p><AssessmentList title="What worked" items={assessment.whatWorked} /><AssessmentList title="Turning points" items={assessment.turningPoints} /><div className="mt-6 grid gap-5 sm:grid-cols-2"><AssessmentList title="What increased resistance" items={assessment.resistance?.increased || []} /><AssessmentList title="What reduced resistance" items={assessment.resistance?.reduced || []} /></div><div className="mt-6 rounded-card bg-primary-light/40 p-4"><p className="text-xs font-medium uppercase tracking-wide text-primary">A stronger response</p><p className="mt-2 text-sm leading-6 text-ink">{assessment.strongerResponse}</p></div><div className="mt-5"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Progress toward your goal</p><p className="mt-2 text-sm leading-6 text-ink">{assessment.goalProgress}</p></div>{assessment.replayPoint && <div className="mt-5 rounded-card border border-border p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">A moment worth revisiting · exchange {assessment.replayPoint.turn}</p><p className="mt-2 text-sm leading-6 text-ink">{assessment.replayPoint.why}</p><button onClick={onReplay} className="mt-4 rounded-pill bg-primary px-4 py-2 text-sm font-medium text-white">Replay this turning point →</button></div>}<button onClick={onNew} className="mt-7 rounded-pill border border-border px-5 py-3 text-sm font-medium text-ink">Start a new simulation</button></div></section> }
function AssessmentList({ title, items }: { title: string; items: string[] }) { return <div className="mt-6"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">{title}</p>{items.length ? <ul className="mt-2 space-y-2 text-sm leading-6 text-ink">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className="text-primary">•</span><span>{item}</span></li>)}</ul> : <p className="mt-2 text-sm text-ink-light">Nothing notable here.</p>}</div> }
type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string } }> }
type SpeechRecognizer = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((event: SpeechResultEvent) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }
type BrowserSpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer }

function VideoCallFrame({ sessionId, person, messages, typing, speaking, audioError, input, setInput, onSubmit, onVoiceTranscript, onEnd, disabled, channel }: { sessionId: string | null; person: string; messages: Message[]; typing: boolean; speaking: boolean; audioError: string; input: string; setInput: (value: string) => void; onSubmit: (event: FormEvent) => void; onVoiceTranscript: (role: 'user' | 'simulated_person', content: string) => Promise<void>; onEnd: () => void; disabled: boolean; channel: 'phone' | 'video' }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [callConnected, setCallConnected] = useState(false)
  const [callBusy, setCallBusy] = useState(false)
  const [ringing, setRinging] = useState(false)
  const [liveCaption, setLiveCaption] = useState('')
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const recognitionRef = useRef<SpeechRecognizer | null>(null)
  const savedVoiceTranscriptRef = useRef({ user: '', simulated_person: '' })

  async function enableMedia() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
      setMicOn(true)
      setMediaError('')
    } catch { setMediaError('Camera or microphone permission was unavailable. You can continue with the text fallback.') }
  }

  async function startLiveCall() {
    if (!sessionId || callBusy || callConnected) return
    setCallBusy(true)
    setRinging(String(channel) === 'phone')
    setMediaError('')
    try {
      if (String(channel) === 'phone') {
        const audioContext = new AudioContext()
        for (let index = 0; index < 2; index += 1) {
          const startAt = audioContext.currentTime + index * 0.7
          const oscillator = audioContext.createOscillator()
          const secondOscillator = audioContext.createOscillator()
          const gain = audioContext.createGain()
          oscillator.frequency.value = 440
          secondOscillator.frequency.value = 480
          gain.gain.setValueAtTime(0.0001, startAt)
          gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.03)
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.35)
          oscillator.connect(gain)
          secondOscillator.connect(gain)
          gain.connect(audioContext.destination)
          oscillator.start(startAt)
          secondOscillator.start(startAt)
          oscillator.stop(startAt + 0.4)
          secondOscillator.stop(startAt + 0.4)
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500))
        await audioContext.close()
      }
      const stream = streamRef.current || await navigator.mediaDevices.getUserMedia({ video: channel === 'video', audio: true })
      streamRef.current = stream
      if (videoRef.current && channel === 'video') videoRef.current.srcObject = stream
      const peer = new RTCPeerConnection()
      peerRef.current = peer
      peer.ontrack = (event) => { if (audioRef.current) audioRef.current.srcObject = event.streams[0] }
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) peer.addTrack(audioTrack, stream)
      const events = peer.createDataChannel('oai-events')
      events.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; delta?: string; transcript?: string }
          if (payload.type === 'response.output_audio_transcript.delta' && payload.delta) setLiveCaption((current) => current + payload.delta)
          if (payload.type === 'conversation.item.input_audio_transcription.completed' && payload.transcript && savedVoiceTranscriptRef.current.user !== payload.transcript) { savedVoiceTranscriptRef.current.user = payload.transcript; setLiveCaption(payload.transcript); void onVoiceTranscript('user', payload.transcript) }
          if (payload.type === 'response.output_audio_transcript.done' && payload.transcript && savedVoiceTranscriptRef.current.simulated_person !== payload.transcript) { savedVoiceTranscriptRef.current.simulated_person = payload.transcript; setLiveCaption(payload.transcript); void onVoiceTranscript('simulated_person', payload.transcript) }
        } catch { /* Ignore non-JSON WebRTC events. */ }
      }
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      const response = await fetch(`/api/labs/adaptive-conversation/${sessionId}/realtime`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Realtime voice session could not start.')
      await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() })
      events.onopen = () => {
        events.send(JSON.stringify({ type: 'response.create', response: { instructions: channel === 'phone' ? 'Give a brief, casual hello first, such as "Hey, what\'s up?" Do not mention the setup or guess what the user wants yet.' : undefined } }))
        setCallConnected(true)
      }
      setCameraOn(channel === 'video')
      setMicOn(true)
    } catch (error) {
      peerRef.current?.close()
      setMediaError(error instanceof Error ? error.message : 'Realtime voice could not start. Use the text fallback.')
    } finally { setCallBusy(false); setRinging(false) }
  }

  function toggleCamera() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCameraOn(track.enabled)
  }

  function toggleMic() {
    const track = streamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMicOn(track.enabled)
  }

  function captureSpeech() {
    const browserWindow = window as BrowserSpeechWindow
    const SpeechRecognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition
    if (!SpeechRecognition) { setMediaError('Live speech recognition is unavailable in this browser. Use the text fallback below.'); return }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.onresult = (event: SpeechResultEvent) => setInput(Array.from(event.results).map((result) => result[0].transcript).join(' '))
    recognition.onerror = () => setMediaError('Microphone transcription failed. Use the text fallback below.')
    recognition.onend = () => setMicOn(Boolean(streamRef.current?.getAudioTracks()[0]?.enabled))
    recognitionRef.current = recognition
    setMicOn(true)
    recognition.start()
  }

  useEffect(() => () => { peerRef.current?.close(); streamRef.current?.getTracks().forEach((track) => track.stop()); recognitionRef.current?.stop() }, [])
  const latest = [...messages].reverse().find((message) => message.role === 'simulated_person')
  if (String(channel) === 'phone') return <PhoneCallFrame audioRef={audioRef} person={person} messages={messages} connected={callConnected} ringing={ringing} connecting={callBusy} muted={!micOn} caption={liveCaption} error={mediaError || audioError} input={input} setInput={setInput} onStart={startLiveCall} onMute={toggleMic} onEnd={onEnd} onSubmit={onSubmit} disabled={disabled} />
  return <section className="mx-auto mb-5 max-w-3xl rounded-card border border-border bg-[#17202B] p-4 text-white shadow-sm"><audio ref={audioRef} autoPlay /><div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">Beckett {channel === 'video' ? 'video' : 'phone'} practice</p><h2 className="mt-1 text-xl">Conversation with {person}</h2></div><span className={`rounded-pill px-3 py-1 text-xs ${speaking || typing ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-white/70'}`}>{speaking ? 'Speaking' : typing ? 'Listening…' : callConnected ? 'Live' : 'Ready'}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]"><div className="relative flex min-h-[220px] items-end overflow-hidden rounded-card bg-gradient-to-br from-[#33485C] to-[#111820] p-4"><div className="absolute left-4 top-4 rounded-pill bg-black/25 px-3 py-1 text-xs text-white/80">{person} · AI persona</div><div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-full border border-white/25 bg-white/10 text-5xl">{person.trim().charAt(0).toUpperCase() || 'B'}</div><div className="absolute bottom-3 left-3 right-3 rounded-card bg-black/40 px-3 py-2 text-sm leading-5">{liveCaption || (typing ? `${person} is responding…` : latest?.content || 'Start the live conversation below.')}</div></div><div className="relative min-h-[160px] overflow-hidden rounded-card bg-[#263341]">{cameraOn && channel === 'video' ? <video ref={videoRef} autoPlay muted playsInline className="h-full min-h-[160px] w-full object-cover" /> : <div className="flex h-full min-h-[160px] items-center justify-center px-4 text-center text-xs text-white/60">{channel === 'phone' ? 'Phone audio only' : 'Your camera is off. Audio still works.'}</div>}<span className="absolute bottom-2 left-2 rounded-pill bg-black/40 px-2 py-1 text-[10px] text-white/80">You</span></div></div><div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={startLiveCall} disabled={callBusy || callConnected} className="rounded-pill bg-primary px-3 py-2 text-xs">{callBusy ? 'Connecting…' : callConnected ? 'Live voice connected' : 'Start live voice'}</button><button type="button" onClick={enableMedia} className="rounded-pill bg-white/15 px-3 py-2 text-xs hover:bg-white/25">{cameraOn || micOn ? 'Permissions ready' : 'Enable camera & mic'}</button><button type="button" onClick={toggleCamera} disabled={!streamRef.current || channel !== 'video'} className="rounded-pill bg-white/10 px-3 py-2 text-xs disabled:opacity-40">{cameraOn ? 'Camera off' : 'Camera on'}</button><button type="button" onClick={toggleMic} disabled={!streamRef.current} className="rounded-pill bg-white/10 px-3 py-2 text-xs disabled:opacity-40">{micOn ? 'Mute mic' : 'Unmute mic'}</button><button type="button" onClick={captureSpeech} disabled={disabled || callConnected} className="rounded-pill bg-white/10 px-3 py-2 text-xs">Text transcription fallback</button></div>{(mediaError || audioError) && <p className="mt-3 rounded-card bg-amber-100/10 px-3 py-2 text-xs leading-5 text-amber-100">{mediaError || audioError}</p>}<div className="mt-4 rounded-card bg-white/5 p-3"><p className="text-[10px] font-medium uppercase tracking-wide text-white/50">Live transcript · text fallback</p><form onSubmit={onSubmit} className="mt-2 flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={callConnected ? 'Voice is live; type if needed…' : 'Type if audio is unavailable…'} className="min-w-0 flex-1 rounded-pill border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40" disabled={disabled} /><button type="submit" disabled={disabled || !input.trim()} className="rounded-pill bg-white px-4 py-2 text-xs font-medium text-ink disabled:opacity-40">Send</button></form></div></section>
}

function PhoneCallFrame({ audioRef, person, messages: rawMessages, connected, ringing, connecting, muted, caption, error, input, setInput, onStart, onMute, onEnd, onSubmit, disabled }: { audioRef: React.RefObject<HTMLAudioElement>; person: string; messages: Message[]; connected: boolean; ringing: boolean; connecting: boolean; muted: boolean; caption: string; error: string; input: string; setInput: (value: string) => void; onStart: () => void; onMute: () => void; onEnd: () => void; onSubmit: (event: FormEvent) => void; disabled: boolean }) {
  const messages = rawMessages.filter((message, index, items) => items.findIndex((candidate) => candidate.role === message.role && candidate.content.replace(/\s+/g, ' ').trim().toLowerCase() === message.content.replace(/\s+/g, ' ').trim().toLowerCase()) === index)
  const latest = [...messages].reverse().find((message) => message.role === 'simulated_person')
  return <section className="mx-auto mb-5 max-w-3xl overflow-hidden rounded-[2rem] border border-[#D8D0C5] bg-[#F7F3ED] shadow-sm"><audio ref={audioRef} autoPlay /><div className="bg-[#1B2633] px-6 pb-7 pt-8 text-center text-white"><p className="text-xs font-medium uppercase tracking-[0.2em] text-white/55">Beckett phone practice</p><div className="mx-auto mt-5 flex h-24 w-24 items-center justify-center rounded-full bg-[#D89219] text-4xl font-medium">{person.trim().charAt(0).toUpperCase() || 'B'}</div><h2 className="mt-4 text-2xl">{person}</h2><p className="mt-2 text-sm text-white/60">{ringing ? 'Ringing…' : connecting ? 'Connecting…' : connected ? 'Call in progress' : 'Ready to call'}</p><div className="mx-auto mt-6 max-w-sm rounded-card bg-black/20 px-4 py-3 text-sm leading-6 text-white/85">{connected ? (caption || 'You’re connected. They will greet you first.') : ringing ? 'The call is ringing. They will greet you when it connects.' : 'Start the call to hear a brief hello, then respond naturally.'}</div></div><div className="px-6 py-5"><div className="flex justify-center gap-3"><button type="button" onClick={onStart} disabled={connecting || ringing || connected || disabled} className="rounded-full bg-[#D89219] px-6 py-3 text-sm font-medium text-white disabled:opacity-50">{ringing ? 'Ringing…' : connecting ? 'Connecting…' : connected ? 'Call connected' : 'Start call'}</button><button type="button" onClick={onMute} disabled={!connected || disabled} className="rounded-full border border-border px-5 py-3 text-sm disabled:opacity-40">{muted ? 'Unmute' : 'Mute'}</button><button type="button" onClick={onEnd} disabled={!connected || disabled} className="rounded-full bg-red-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-40">End call</button></div>{error && <p className="mt-4 rounded-card bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">{error}</p>}<div className="mt-6 border-t border-border pt-5"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Live transcript</p><div className="mt-3 min-h-16 space-y-2 text-sm leading-6">{messages.slice(-4).map((message, index) => <p key={`${message.createdAt}-${index}`}><span className="font-medium">{message.role === 'user' ? 'You' : person}:</span> {message.content}</p>)}{connected && !messages.length && <p className="text-ink-light">They will greet you first, then your response will appear here.</p>}{latest && caption && <p className="text-ink-mid"><span className="font-medium">{person}:</span> {caption}</p>}</div><form onSubmit={onSubmit} className="mt-4 flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Text fallback if needed…" className="min-w-0 flex-1 rounded-pill border border-border bg-white px-4 py-2 text-sm outline-none focus:border-primary" disabled={disabled} /><button type="submit" disabled={disabled || !input.trim()} className="rounded-pill border border-border bg-white px-4 py-2 text-xs font-medium disabled:opacity-40">Send text</button></form></div></div></section>
}
