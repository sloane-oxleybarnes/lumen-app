'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import type { AdaptiveAssessment, AdaptiveNudge, AdaptiveReplay, AdaptiveSnapshot, AdaptiveTranscriptItem } from '@/lib/adaptive-conversation'

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
  const [nudge, setNudge] = useState<AdaptiveNudge | null>(null)
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

  async function refreshHistory() {
    const res = await fetch('/api/labs/adaptive-conversation')
    if (!res.ok) return
    const body = await res.json()
    setSavedSessions(body.sessions || [])
  }

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
      setNudge(null)
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
    if (!sessionId || !input.trim() || busy || paused || endReason) return
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
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 45000)
    try {
      const res = await fetch(`/api/labs/adaptive-conversation/${sessionId}/turn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }), signal: controller.signal,
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'The simulated person could not respond.')
      setMessages(body.transcript || [])
      if (body.conversationStatus === 'ended' || body.conversationStatus === 'ending') {
        setEndReason(body.endReason || 'The conversation has reached a natural stopping point.')
      }
      void requestNudge()
    } catch (err) {
      setMessages(previousMessages)
      setError(err instanceof DOMException && err.name === 'AbortError' ? 'The simulated person took too long to respond. Your message is still here—try sending again.' : err instanceof Error ? err.message : 'The simulated person could not respond.')
      setInput(message)
    }
    finally { window.clearTimeout(timeout); setBusy(false); setTyping(false) }
  }

  async function saveVoiceTranscript(role: 'user' | 'simulated_person', content: string) {
    if (endReason) return
    const key = `${role}:${content.trim()}`
    const nowMs = Date.now()
    if (nowMs - (lastVoiceTranscriptRef.current[key] || 0) < 2500) return
    lastVoiceTranscriptRef.current[key] = nowMs
    const item: Message = { role, content, turn: role === 'user' ? messages.filter((message) => message.role === 'user').length + 1 : Math.max(1, messages.filter((message) => message.role === 'user').length), createdAt: new Date().toISOString() }
    setMessages((current) => [...current, item])
    if (sessionId) {
      await fetch(`/api/labs/adaptive-conversation/${sessionId}/realtime/transcript`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, content }) })
      if (role === 'simulated_person' && setup.channel === 'text') void requestNudge()
    }
  }

  async function requestNudge() {
    if (!sessionId || stage !== 'conversation') return
    const response = await fetch(`/api/labs/adaptive-conversation/${sessionId}/nudge`, { method: 'POST' })
    if (!response.ok) return
    const result = await response.json() as AdaptiveNudge
    if (result.shouldNudge) setNudge(result)
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
    try {
      await fetch(`/api/labs/adaptive-conversation/${sessionId}/stop`, { method: 'POST' })
      await refreshHistory()
    }
    finally { setBusy(false); reset() }
  }

  async function finishSimulation(videoTranscript?: Message[]) {
    const transcript = videoTranscript || messages
    if (!sessionId || transcript.length < 2 || busy) return
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
      await refreshHistory()
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

  function reset() { setSetup(blankSetup); setSessionId(null); setMessages([]); setAssessment(null); setAssessmentLoading(false); setReplay(null); setNudge(null); setReplayInput(''); setPaused(false); setHelpText(''); setEndReason(''); setSpeaking(false); setAudioError(''); spokenMessageRef.current = ''; lastVoiceTranscriptRef.current = {}; setStage('setup'); setError('') }

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
            <div className="mt-5"><p className="text-sm font-medium">Practice channel</p><div className="mt-2 flex flex-wrap gap-2">{(['text', 'phone', 'video'] as const).map((channel) => <button key={channel} type="button" onClick={() => updateSetup('channel', channel)} className={`rounded-pill px-4 py-2 text-sm ${setup.channel === channel ? 'bg-primary text-white' : 'border border-border bg-white text-ink-mid'}`}>{channel === 'text' ? 'Text conversation' : channel === 'phone' ? 'Phone call' : 'Video call'}</button>)}</div><p className="mt-2 text-xs text-ink-light">Video starts as a real camera-and-voice call with Beckett; an animated LiveAvatar participant is an optional enhancement.</p></div>
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
        {stage === 'conversation' && setup.person.trim() && setup.situation.trim() && <div className="mx-auto mb-4 max-w-3xl rounded-card border border-primary/20 bg-primary-light/30 p-4"><p className="text-xs font-medium uppercase tracking-wide text-primary">Suggested opening line</p><p className="mt-2 text-sm leading-6 text-ink">“{suggestedOpeningLine(setup)}”</p><p className="mt-1 text-xs text-ink-light">Use it as-is or make it sound like you.</p></div>}
        {stage === 'conversation' && setup.channel !== 'video' && <p className="mx-auto mb-2 max-w-3xl text-xs text-ink-light">{setup.channel === 'phone' ? 'Phone call' : 'Text conversation'} · <span className="capitalize">{setup.difficulty}</span> mode</p>}

        {stage === 'conversation' && nudge && <div className="mx-auto mb-4 max-w-3xl rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6"><p className="text-xs font-medium uppercase tracking-wide text-primary">Beckett’s nudge</p><p className="mt-2">{nudge.prompt}</p>{nudge.examples?.length > 0 && <p className="mt-2 text-ink-mid">Try: “{nudge.examples.join('” or “')}”</p>}<button type="button" onClick={() => { setPaused(true); setHelpText(nudge.prompt); setNudge(null) }} className="mt-3 text-xs font-medium text-primary hover:underline">Pause and work on this</button><button type="button" onClick={() => setNudge(null)} className="ml-4 mt-3 text-xs text-ink-light hover:underline">Keep practicing</button></div>}
        {stage === 'conversation' && (setup.channel === 'video' || setup.channel === 'phone') && <VideoCallFrame sessionId={sessionId} person={setup.person} messages={messages} typing={typing} speaking={speaking} audioError={audioError} input={input} setInput={setInput} onSubmit={sendMessage} onVoiceTranscript={saveVoiceTranscript} onTranscriptSync={setMessages} onSupervisorUpdate={setNudge} onEnd={finishSimulation} onPause={() => setPaused((value) => !value)} paused={paused} disabled={busy} channel={setup.channel} />}

        {stage === 'review' && <section className="mx-auto max-w-3xl rounded-card border border-border bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-light">Step 2</p>
          <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Review and approve</h2>
          <p className="mt-2 text-sm leading-6 text-ink-mid">This is the session-specific context GPT‑5.6 will use. It will not change the permanent contact.</p>
          <div className="mt-6 space-y-4 rounded-card bg-[#FBF8F3] p-5 text-sm"><ReviewRow label="Practice channel" value={setup.channel === 'phone' ? 'Phone call' : setup.channel === 'video' ? 'Video call' : 'Text conversation'} /><ReviewRow label="Person" value={setup.person} /><ReviewRow label="Situation" value={setup.situation} /><ReviewRow label="Goal" value={setup.goal} /><ReviewRow label="Concern" value={setup.concern || 'Not specified'} /><ReviewRow label="Relationship context" value={setup.relationshipContext || 'Not specified'} />{setup.scenarioType === 'contact' && <ReviewRow label="Approved contact context" value={setup.approvedContactContext || 'No additional context'} />}</div>
          <p className="mt-5 rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6 text-ink"><strong>Important:</strong> This is one plausible simulated response, not a prediction of how the real person will behave. New details introduced during role-play remain simulation-only.</p>
          <p className="mt-3 text-xs text-ink-light">Mode: <span className="font-medium capitalize">{setup.difficulty}</span> · This changes the person’s level of patience and resistance, not the underlying scenario.</p>
          <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => setStage('setup')} className="rounded-pill border border-border px-4 py-2 text-sm">Edit setup</button><button onClick={beginSimulation} disabled={busy} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Starting…' : 'Approve and begin →'}</button></div>
        </section>}

        {stage === 'conversation' && setup.channel === 'text' && <section className="mx-auto max-w-3xl"><div className="mb-4 rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6"><strong>{setup.person}</strong> is simulated by GPT‑5.6 in a text conversation. Stay in the conversation; ask for help or finish whenever you are ready.</div><div className="rounded-card border border-border bg-white p-5 shadow-sm"><div className="min-h-[360px] space-y-4">{messages.length === 0 && <p className="py-16 text-center text-sm text-ink-light">Start the conversation when you are ready.</p>}{messages.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-primary text-white' : 'bg-[#FBF8F3] text-ink'}`}><p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-60">{message.role === 'user' ? 'You' : setup.person}</p>{message.content}</div></div>)}{typing && <div className="flex justify-start" aria-live="polite"><div className="rounded-2xl bg-[#FBF8F3] px-4 py-3 text-sm text-ink-mid"><span className="mr-2 text-[10px] font-medium uppercase tracking-wide text-ink-light">{setup.person} is responding</span><span className="inline-flex gap-1 align-middle"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-light" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-light [animation-delay:150ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-light [animation-delay:300ms]" /></span></div></div>}</div>{helpText && <div className="mt-5 rounded-card border border-primary/20 bg-primary-light/30 p-4 text-sm leading-6"><p className="text-xs font-medium uppercase tracking-wide text-primary">Beckett’s pause note</p><p className="mt-2">{helpText}</p><button type="button" onClick={() => { setHelpText(''); setPaused(false) }} className="mt-3 text-xs font-medium text-primary hover:underline">Return to role-play</button></div>}<form onSubmit={sendMessage} className="mt-5 border-t border-border pt-4"><textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={paused ? 'Role-play is paused.' : 'What would you like to say?'} rows={3} className="w-full resize-none rounded-card border border-border px-4 py-3 text-sm outline-none focus:border-primary" disabled={busy || paused} /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-ink-light">{messages.filter((m) => m.role === 'user').length} exchanges · {paused ? 'Paused' : `${setup.difficulty} mode`}</span><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPaused((value) => !value)} disabled={busy} className="rounded-pill border border-border px-3 py-2 text-xs">{paused ? 'Resume' : 'Pause'}</button><button type="button" onClick={askForHelp} disabled={busy || messages.length < 2} className="rounded-pill border border-primary/40 px-3 py-2 text-xs text-primary disabled:opacity-40">Ask for help</button><button type="button" onClick={stopSimulation} disabled={busy} className="rounded-pill border border-red-200 px-3 py-2 text-xs text-red-700">Stop</button><button type="button" onClick={() => { void finishSimulation() }} disabled={busy || messages.length < 2} className="rounded-pill border border-primary/40 px-3 py-2 text-xs text-primary disabled:opacity-40">{busy ? 'Working…' : 'Finish and assess'}</button><button type="submit" disabled={busy || paused || !input.trim()} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? 'Replying…' : 'Send'}</button></div></div></form></div></section>}

        {stage === 'assessment' && assessmentLoading && <section className="mx-auto max-w-3xl rounded-card border border-border bg-white p-8 text-center shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-primary">Conversation ended</p><h2 className="mt-2 text-3xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Preparing your debrief…</h2><p className="mt-3 text-sm leading-6 text-ink-mid">The role-play is finished. Beckett is reviewing the transcript for turning points, resistance, goal progress, and a useful replay point.</p><div className="mx-auto mt-6 h-2 max-w-xs overflow-hidden rounded-pill bg-primary-light"><div className="h-full w-1/2 animate-pulse rounded-pill bg-primary" /></div></section>}
        {stage === 'assessment' && assessment && <AssessmentViewUpdated assessment={assessment} openingMessages={messages.slice(0, 2)} canReplay={setup.channel === 'text'} onNew={reset} onReplay={startReplay} />}

        {stage === 'replay' && setup.channel === 'text' && assessment?.replayPoint && <section className="mx-auto max-w-3xl"><div className="rounded-card border border-border bg-white p-6 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-primary">Replay a turning point</p><h2 className="mt-1 text-3xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Try the moment again</h2><p className="mt-3 text-sm leading-6 text-ink-mid">The original session is preserved. You are restoring the conversation immediately before exchange {assessment.replayPoint.turn}; your next response will create a separate branch.</p>{replay && <div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-card bg-[#FBF8F3] p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Original trajectory</p><p className="mt-2 text-sm font-medium capitalize">{replay.originalTrajectory}</p><p className="mt-2 text-sm leading-6 text-ink-mid">{replay.originalOutcome}</p></div><div className="rounded-card border border-primary/20 bg-primary-light/30 p-4"><p className="text-xs font-medium uppercase tracking-wide text-primary">Replay trajectory</p><p className="mt-2 text-sm font-medium capitalize">{replay.replayTrajectory}</p><p className="mt-2 text-sm leading-6 text-ink-mid">{replay.replayOutcome}</p></div></div>}{replay && <div className="mt-6 space-y-3 border-t border-border pt-5">{replay.transcript.map((message, index) => <div key={`${message.createdAt}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-primary text-white' : 'bg-[#FBF8F3] text-ink'}`}><p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-60">{message.role === 'user' ? 'Your replay' : setup.person}</p>{message.content}</div></div>)}</div>}<form onSubmit={sendReplay} className="mt-6 border-t border-border pt-5"><label className="text-sm font-medium">{replay ? 'Continue the replay' : `What would you say differently to ${setup.person}?`}<textarea value={replayInput} onChange={(e) => setReplayInput(e.target.value)} rows={4} placeholder="Try a different response…" className="mt-2 w-full resize-none rounded-card border border-border px-4 py-3 text-sm outline-none focus:border-primary" disabled={replayBusy} /></label><div className="mt-3 flex justify-between gap-3"><button type="button" onClick={() => setStage('assessment')} className="rounded-pill border border-border px-4 py-2 text-sm">Back to assessment</button><button type="submit" disabled={replayBusy || !replayInput.trim()} className="rounded-pill bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-40">{replayBusy ? 'Replaying…' : replay ? 'Continue replay' : 'Try this response →'}</button></div></form></div></section>}

        {stage === 'setup' && savedSessions.length > 0 && <section className="mt-8 rounded-card border border-border bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Saved simulations</p><h2 className="mt-1 text-xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>Your recent practice</h2></div><p className="text-xs text-ink-light">Full transcripts are saved until you delete them.</p></div><div className="mt-4 divide-y divide-border">{savedSessions.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{item.setup_snapshot?.person || 'Conversation'}</p><p className="text-xs text-ink-light">{item.setup_snapshot?.situation || 'Saved simulation'} · {new Date(item.updated_at).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><button onClick={() => retrySession(item)} className="text-xs font-medium text-primary hover:underline">Retry this situation</button><button onClick={() => deleteSession(item.id)} className="text-xs text-red-700 hover:underline">Delete</button></div></div>)}</div></section>}
      </div>
    </main>
  )
}

function suggestedOpeningLine(setup: Setup) {
  const topic = setup.situation.trim().replace(/[.!?]+$/, '').replace(/^(I want to|I need to|We need to)\s+/i, '').slice(0, 90)
  return `Hi, do you have a minute to talk about ${topic || 'something I wanted to check in on'}?`
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="block text-sm font-medium">{label}<input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 block w-full rounded-card border border-border px-3 py-3 text-sm font-normal outline-none focus:border-primary" /></label> }
function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="mt-5 block text-sm font-medium">{label}<textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className="mt-2 block w-full resize-none rounded-card border border-border px-3 py-3 text-sm font-normal outline-none focus:border-primary" /></label> }
function ReviewRow({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-ink-light">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{value}</p></div> }
export function AssessmentViewLegacy({ assessment, onNew, onReplay }: { assessment: Assessment; onNew: () => void; onReplay: () => void }) { return <section className="mx-auto max-w-3xl"><div className="rounded-card border border-border bg-white p-6 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-primary">Conversation assessment</p><h2 className="mt-1 text-3xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>What this conversation showed</h2><p className="mt-4 text-sm leading-6 text-ink">{assessment.summary}</p><AssessmentList title="What worked" items={assessment.whatWorked} /><AssessmentList title="Turning points" items={assessment.turningPoints} /><div className="mt-6 grid gap-5 sm:grid-cols-2"><AssessmentList title="What increased resistance" items={assessment.resistance?.increased || []} /><AssessmentList title="What reduced resistance" items={assessment.resistance?.reduced || []} /></div><div className="mt-6 rounded-card bg-primary-light/40 p-4"><p className="text-xs font-medium uppercase tracking-wide text-primary">A stronger response</p><p className="mt-2 text-sm leading-6 text-ink">{(assessment as Assessment & { strongerResponse?: string }).strongerResponse || 'Review the turning points and replay a moment that would be useful to try again.'}</p></div><div className="mt-5"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Progress toward your goal</p><p className="mt-2 text-sm leading-6 text-ink">{assessment.goalProgress}</p></div>{assessment.replayPoint && <div className="mt-5 rounded-card border border-border p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">A moment worth revisiting · exchange {assessment.replayPoint.turn}</p><p className="mt-2 text-sm leading-6 text-ink">{assessment.replayPoint.why}</p><button onClick={onReplay} className="mt-4 rounded-pill bg-primary px-4 py-2 text-sm font-medium text-white">Replay this turning point →</button></div>}<button onClick={onNew} className="mt-7 rounded-pill border border-border px-5 py-3 text-sm font-medium text-ink">Start a new simulation</button></div></section> }

function AssessmentViewUpdated({ assessment, openingMessages, canReplay, onNew, onReplay }: { assessment: Assessment; openingMessages: Message[]; canReplay: boolean; onNew: () => void; onReplay: () => void }) {
  return <section className="mx-auto max-w-3xl"><div className="rounded-card border border-border bg-white p-6 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-primary">Conversation assessment</p><h2 className="mt-1 text-3xl" style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}>What this conversation showed</h2><p className="mt-4 text-sm leading-6 text-ink">{assessment.summary}</p>{openingMessages.length > 0 && <div className="mt-6 rounded-card bg-[#FBF8F3] p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Opening exchange</p>{openingMessages.map((message, index) => <p key={`${message.createdAt}-${index}`} className="mt-2 text-sm leading-6"><span className="font-medium">{message.role === 'user' ? 'You' : 'The other person'}:</span> {message.content}</p>)}</div>}<AssessmentList title="What worked" items={assessment.whatWorked} /><TurningPointList items={assessment.turningPoints} /><div className="mt-6 grid gap-5 sm:grid-cols-2"><AssessmentList title="What increased resistance" items={assessment.resistance?.increased || []} /><AssessmentList title="What reduced resistance" items={assessment.resistance?.reduced || []} /></div><div className="mt-5"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Progress toward your goal</p><p className="mt-2 text-sm leading-6 text-ink">{assessment.goalProgress}</p></div>{canReplay && assessment.replayPoint && <div className="mt-5 rounded-card border border-border p-4"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">A moment worth revisiting</p><p className="mt-2 text-sm leading-6 text-ink">{assessment.replayPoint.why}</p><button onClick={onReplay} className="mt-4 rounded-pill bg-primary px-4 py-2 text-sm font-medium text-white">Replay this turning point →</button></div>}<button onClick={onNew} className="mt-7 rounded-pill border border-border px-5 py-3 text-sm font-medium text-ink">Start a new simulation</button></div></section>
}

function TurningPointList({ items }: { items: Assessment['turningPoints'] }) { return <div className="mt-6"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Turning points</p><div className="mt-3 space-y-3">{items.length ? items.map((item, index) => typeof item === 'string' ? <p key={`${item}-${index}`} className="text-sm leading-6 text-ink">{item}</p> : <div key={`${item.turn}-${index}`} className="rounded-card border border-border bg-[#FBF8F3] p-4"><p className="text-xs font-medium uppercase tracking-wide text-primary">Exchange {item.turn}</p><p className="mt-2 text-sm leading-6"><span className="font-medium">You:</span> “{item.userSaid}”</p><p className="mt-1 text-sm leading-6"><span className="font-medium">The other person:</span> “{item.personSaid}”</p><p className="mt-2 text-sm leading-6 text-ink-mid">{item.why}</p></div>) : <p className="text-sm text-ink-light">Nothing notable here.</p>}</div></div> }
function AssessmentList({ title, items }: { title: string; items: Array<string | { why?: string }> }) { return <div className="mt-6"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">{title}</p>{items.length ? <ul className="mt-2 space-y-2 text-sm leading-6 text-ink">{items.map((item, index) => <li key={`${typeof item === 'string' ? item : item.why || index}-${index}`} className="flex gap-2"><span className="text-primary">•</span><span>{typeof item === 'string' ? item : item.why}</span></li>)}</ul> : <p className="mt-2 text-sm text-ink-light">Nothing notable here.</p>}</div> }
type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string } }> }
type SpeechRecognizer = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((event: SpeechResultEvent) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }
type BrowserSpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer }

function VideoCallFrame({ sessionId, person, messages, typing, speaking, audioError, input, setInput, onSubmit, onVoiceTranscript, onTranscriptSync, onSupervisorUpdate, onEnd, onPause, paused, disabled, channel }: { sessionId: string | null; person: string; messages: Message[]; typing: boolean; speaking: boolean; audioError: string; input: string; setInput: (value: string) => void; onSubmit: (event: FormEvent) => void; onVoiceTranscript: (role: 'user' | 'simulated_person', content: string) => Promise<void>; onTranscriptSync: (messages: Message[]) => void; onSupervisorUpdate: (nudge: AdaptiveNudge) => void; onEnd: (transcript?: Message[]) => void | Promise<void>; onPause: () => void; paused: boolean; disabled: boolean; channel: 'phone' | 'video' }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [callConnected, setCallConnected] = useState(false)
  const [callBusy, setCallBusy] = useState(false)
  const [avatarEmbedUrl, setAvatarEmbedUrl] = useState('')
  const [avatarEmbedId, setAvatarEmbedId] = useState('')
  const [avatarEmbedBusy, setAvatarEmbedBusy] = useState(false)
  const [avatarEnding, setAvatarEnding] = useState(false)
  const [avatarEmbedError, setAvatarEmbedError] = useState('')
  const [avatarContextId, setAvatarContextId] = useState('')
  const avatarContextIdRef = useRef('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [ringing, setRinging] = useState(false)
  const [liveCaption, setLiveCaption] = useState('')
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const recognitionRef = useRef<SpeechRecognizer | null>(null)
  const savedVoiceTranscriptRef = useRef({ user: '', simulated_person: '' })
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const supervisedFingerprintRef = useRef('')
  const openingResponseSentRef = useRef(false)
  const responsePendingRef = useRef(false)

  async function startSandboxAvatar() {
    if (!sessionId || avatarEmbedBusy || avatarEmbedUrl) return
    setAvatarEmbedBusy(true)
    setAvatarEmbedError('')
    try {
      const response = await fetch(`/api/labs/adaptive-conversation/${sessionId}/liveavatar`, { method: 'POST' })
      const body = await response.json().catch(() => null) as { url?: string; embedId?: string | null; contextId?: string | null; personalized?: boolean; warning?: string; error?: string } | null
      if (!response.ok || !body?.url) throw new Error(body?.error || 'LiveAvatar sandbox could not be started.')
      setAvatarEmbedUrl(body.url)
      setAvatarEmbedId(body.embedId || '')
      setAvatarContextId(body.contextId || '')
      avatarContextIdRef.current = body.contextId || ''
      if (body.warning) setAvatarEmbedError(body.warning)
      setCallConnected(true)
    } catch (error) {
      setAvatarEmbedError(error instanceof Error ? error.message : 'LiveAvatar sandbox could not be started.')
    } finally {
      setAvatarEmbedBusy(false)
    }
  }

  async function stopAvatarSession(showError = true) {
    const contextId = avatarContextId
    const embedId = avatarEmbedId
    setAvatarEmbedUrl('')
    setAvatarEmbedId('')
    avatarContextIdRef.current = ''
    setAvatarContextId('')
    setCallConnected(false)
    let transcript = messages
    if (!sessionId || (!contextId && !embedId)) return transcript
    const response = await fetch(`/api/labs/adaptive-conversation/${sessionId}/liveavatar`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contextId, embedId }),
    }).catch(() => null)
    const body = await response?.json().catch(() => null) as { transcript?: Message[]; error?: string } | null
    if (Array.isArray(body?.transcript) && body.transcript.length) {
      transcript = body.transcript
      onTranscriptSync(transcript)
    }
    if (showError && body?.error && !body.transcript?.length) setAvatarEmbedError(body.error)
    return transcript
  }

  async function endSandboxAvatar() {
    if (!sessionId || avatarEnding) return
    setAvatarEnding(true)
    const transcript = await stopAvatarSession()
    await onEnd(transcript)
    setAvatarEnding(false)
  }

  async function switchToAudioFallback() {
    if (avatarEnding || callBusy) return
    setAvatarEnding(true)
    await stopAvatarSession(false)
    setAvatarEnding(false)
    await startLiveCall(false)
  }

  async function endLiveCall() {
    const transcript = messages
    setCallConnected(false)
    setCallBusy(false)
    setRinging(false)
    dataChannelRef.current?.close()
    dataChannelRef.current = null
    peerRef.current?.close()
    peerRef.current = null
    recognitionRef.current?.stop()
    await onEnd(transcript)
  }

  async function enableMedia() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setCameraOn(true)
      setMicOn(true)
      setMediaError('')
    } catch { setMediaError('Camera or microphone permission was unavailable. You can continue with the text fallback.') }
  }

  const requestLiveSupervision = useCallback(async () => {
    if (!sessionId) return
    const response = await fetch(`/api/labs/adaptive-conversation/${sessionId}/supervise`, { method: 'POST' }).catch(() => null)
    if (!response?.ok) return
    const body = await response.json().catch(() => null) as { shouldNudge?: boolean; prompt?: string; examples?: string[]; instructions?: string } | null
    if (body?.shouldNudge && body.prompt) onSupervisorUpdate({ shouldNudge: true, prompt: body.prompt, examples: body.examples || [] })
    if (body?.instructions && dataChannelRef.current?.readyState === 'open' && (String(channel) === 'phone' || !avatarEmbedUrl)) {
      dataChannelRef.current.send(JSON.stringify({ type: 'session.update', session: { instructions: body.instructions } }))
    }
  }, [avatarEmbedUrl, channel, onSupervisorUpdate, sessionId])

  async function startLiveCall(audioOnly = false) {
    if (!sessionId || callBusy || callConnected) return
    setCallBusy(true)
    setRinging(String(channel) === 'phone')
    setMediaError('')
    openingResponseSentRef.current = false
    responsePendingRef.current = false
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
      const stream = streamRef.current || await navigator.mediaDevices.getUserMedia({ video: !audioOnly && channel === 'video', audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      streamRef.current = stream
      if (videoRef.current && channel === 'video') videoRef.current.srcObject = stream
      const peer = new RTCPeerConnection()
      peerRef.current = peer
      peer.ontrack = (event) => { if (audioRef.current) audioRef.current.srcObject = event.streams[0] }
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) peer.addTrack(audioTrack, stream)
      const events = peer.createDataChannel('oai-events')
      dataChannelRef.current = events
      events.onopen = () => {
        if (openingResponseSentRef.current) return
        openingResponseSentRef.current = true
        responsePendingRef.current = true
        events.send(JSON.stringify({ type: 'response.create', response: { instructions: channel === 'phone' ? 'Give one brief, casual hello first, such as "Hey, what\'s up?" Do not mention the setup or guess what the user wants yet.' : undefined } }))
        setCallConnected(true)
      }
      events.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; delta?: string; transcript?: string }
          if (payload.type === 'response.done') responsePendingRef.current = false
          if (payload.type === 'input_audio_buffer.speech_stopped' && !responsePendingRef.current && events.readyState === 'open') {
            responsePendingRef.current = true
            events.send(JSON.stringify({ type: 'response.create' }))
          }
          if (payload.type === 'response.output_audio_transcript.delta' && payload.delta) setLiveCaption((current) => current + payload.delta)
          if (payload.type === 'conversation.item.input_audio_transcription.completed' && payload.transcript && savedVoiceTranscriptRef.current.user !== payload.transcript) { savedVoiceTranscriptRef.current.user = payload.transcript; setLiveCaption(payload.transcript); void onVoiceTranscript('user', payload.transcript) }
          if (payload.type === 'response.output_audio_transcript.done' && payload.transcript && savedVoiceTranscriptRef.current.simulated_person !== payload.transcript) {
            savedVoiceTranscriptRef.current.simulated_person = payload.transcript
            setLiveCaption(payload.transcript)
            void (async () => { await onVoiceTranscript('simulated_person', payload.transcript || ''); await requestLiveSupervision() })()
          }
        } catch { /* Ignore non-JSON WebRTC events. */ }
      }
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      const response = await fetch(`/api/labs/adaptive-conversation/${sessionId}/realtime`, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Realtime voice session could not start.')
      await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() })
      setCameraOn(!audioOnly && channel === 'video' && Boolean(stream.getVideoTracks().length))
      setMicOn(true)
    } catch (error) {
      peerRef.current?.close()
      setCallConnected(false)
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

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream || String(channel) !== 'video' || !cameraOn) return
    if (video.srcObject !== stream) video.srcObject = stream
    void video.play().catch(() => undefined)
  }, [cameraOn, channel])

  useEffect(() => () => {
    const contextId = avatarContextIdRef.current
    if (String(channel) === 'video' && sessionId && contextId) {
      void fetch(`/api/labs/adaptive-conversation/${sessionId}/liveavatar`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextId, embedId: avatarEmbedId }),
        keepalive: true,
      }).catch(() => undefined)
    }
    peerRef.current?.close()
    dataChannelRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    recognitionRef.current?.stop()
  }, [channel, sessionId, avatarEmbedId])
  useEffect(() => {
    if (String(channel) !== 'video' || !sessionId || !avatarEmbedId || !avatarEmbedUrl) return
    let cancelled = false
    const syncTranscript = async () => {
      const response = await fetch(`/api/labs/adaptive-conversation/${sessionId}/liveavatar?embedId=${encodeURIComponent(avatarEmbedId)}`)
      if (!response.ok || cancelled) return
      const body = await response.json().catch(() => null) as { transcript?: Message[] } | null
      if (!cancelled && Array.isArray(body?.transcript) && body.transcript.length) {
        onTranscriptSync(body.transcript)
        const fingerprint = body.transcript.map((message) => `${message.role}:${message.content}`).join('|')
        const latestMessage = body.transcript[body.transcript.length - 1]
        if (latestMessage?.role === 'simulated_person' && fingerprint !== supervisedFingerprintRef.current) {
          supervisedFingerprintRef.current = fingerprint
          void requestLiveSupervision()
        }
      }
    }
    void syncTranscript()
    const interval = window.setInterval(() => { void syncTranscript() }, 3500)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [avatarEmbedId, avatarEmbedUrl, channel, onTranscriptSync, requestLiveSupervision, sessionId])
  const latest = [...messages].reverse().find((message) => message.role === 'simulated_person')
  if (String(channel) === 'phone') return <PhoneCallFrameCompact audioRef={audioRef} person={person} connected={callConnected} ringing={ringing} connecting={callBusy} paused={paused} caption={liveCaption} error={mediaError || audioError} input={input} setInput={setInput} onStart={startLiveCall} onPause={() => { toggleMic(); onPause() }} onEnd={onEnd} onSubmit={onSubmit} disabled={disabled} />
  return <section className="mx-auto mb-5 max-w-4xl rounded-[2rem] border border-border bg-[#17202B] p-4 text-white shadow-sm sm:p-5"><audio ref={audioRef} autoPlay /><div className="flex items-center justify-between gap-4"><div><p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/55">Beckett video practice</p><h2 className="mt-1 text-xl sm:text-2xl">Conversation with {person}</h2></div><span className={`shrink-0 rounded-pill px-3 py-1 text-xs ${speaking || typing ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-white/70'}`}>{speaking ? 'Speaking' : typing ? 'Listening…' : callConnected ? 'Live' : 'Ready'}</span></div><div className="relative mt-4 aspect-video overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#34495D] via-[#1F2D3B] to-[#101820]">{avatarEmbedUrl ? <iframe src={avatarEmbedUrl} title={`${person} LiveAvatar sandbox`} allow="autoplay; microphone; camera; fullscreen" allowFullScreen onError={() => setAvatarEmbedError('LiveAvatar could not load. Use the Beckett video call to continue.')} className="absolute inset-0 h-full w-full border-0" /> : <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"><div className="absolute left-5 top-5 rounded-pill bg-black/25 px-3 py-1 text-xs text-white/75">{person} · AI persona</div><div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/25 bg-white/10 text-5xl">{person.trim().charAt(0).toUpperCase() || 'B'}</div><p className="mt-5 text-lg text-white/85">{callConnected ? 'Conversation live. Speak naturally.' : 'Ready when you are.'}</p>{!callConnected && <button type="button" onClick={() => { void startLiveCall(false) }} disabled={callBusy} className="mt-5 rounded-pill bg-primary px-6 py-3 text-sm font-medium text-white shadow-lg shadow-black/20 disabled:opacity-60">{callBusy ? 'Connecting…' : 'Start conversation'}</button>}</div>}{(liveCaption || typing || latest?.content) && <div className="absolute bottom-5 left-5 right-5 rounded-2xl bg-black/55 px-4 py-3 text-sm leading-6 text-white/90 backdrop-blur-sm">{liveCaption || (typing ? `${person} is responding…` : latest?.content)}</div>}<div className="absolute bottom-4 right-4 h-28 w-44 overflow-hidden rounded-xl border border-white/30 bg-[#263341] shadow-xl sm:h-32 sm:w-52">{cameraOn && channel === 'video' ? <video ref={videoRef} autoPlay muted playsInline onLoadedMetadata={(event) => { void event.currentTarget.play().catch(() => undefined) }} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-3 text-center text-xs text-white/60">Your camera is off</div>}<span className="absolute bottom-2 left-2 rounded-pill bg-black/50 px-2 py-1 text-[10px] text-white/80">You</span></div></div><div className="mt-4 flex flex-wrap items-center justify-center gap-2">{(avatarEmbedUrl || (callConnected && channel === 'video')) && <button type="button" onClick={avatarEmbedUrl ? endSandboxAvatar : endLiveCall} disabled={avatarEnding || disabled} className="rounded-pill bg-red-500/80 px-3 py-2 text-xs disabled:opacity-50">{avatarEnding ? 'Ending conversation…' : 'End conversation'}</button>}{!avatarEmbedUrl && !callConnected && <button type="button" onClick={startSandboxAvatar} disabled={avatarEmbedBusy || disabled} className="rounded-pill bg-white/10 px-3 py-2 text-xs disabled:opacity-50">{avatarEmbedBusy ? 'Starting animated avatar…' : 'Try animated avatar'}</button>}<button type="button" onClick={avatarEmbedUrl ? switchToAudioFallback : () => startLiveCall(false)} disabled={avatarEnding || callBusy || (callConnected && !avatarEmbedUrl) || disabled} className="rounded-pill bg-white/10 px-3 py-2 text-xs">{avatarEmbedUrl ? 'Switch to Beckett video call' : callBusy ? 'Connecting…' : 'Start camera & mic'}</button><button type="button" onClick={enableMedia} className="rounded-pill bg-white/10 px-3 py-2 text-xs">{cameraOn || micOn ? 'Permissions ready' : 'Enable camera & mic'}</button><button type="button" onClick={toggleCamera} disabled={!streamRef.current} className="rounded-pill bg-white/10 px-3 py-2 text-xs disabled:opacity-40">{cameraOn ? 'Camera off' : 'Camera on'}</button><button type="button" onClick={toggleMic} disabled={!streamRef.current} className="rounded-pill bg-white/10 px-3 py-2 text-xs disabled:opacity-40">{micOn ? 'Mute mic' : 'Unmute mic'}</button><button type="button" onClick={() => setShowTranscript((value) => !value)} className="rounded-pill bg-white/10 px-3 py-2 text-xs">{showTranscript ? 'Hide transcript' : 'Show transcript'}</button>{showTranscript && <button type="button" onClick={captureSpeech} disabled={disabled || callConnected || Boolean(avatarEmbedUrl)} className="rounded-pill bg-white/10 px-3 py-2 text-xs disabled:opacity-40">Use text transcription</button>}</div><p className="mt-3 text-center text-xs leading-5 text-white/50">Video uses Beckett’s live voice call first: your camera preview, microphone, spoken response, optional captions, and the same debrief. LiveAvatar remains an optional animated participant.</p>{(mediaError || audioError || avatarEmbedError) && <p className="mt-3 rounded-card bg-amber-100/10 px-3 py-2 text-xs leading-5 text-amber-100">{mediaError || audioError || avatarEmbedError}</p>}{showTranscript && <div className="mt-4 rounded-card bg-white/5 p-4"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-medium uppercase tracking-wide text-white/50">Live transcript</p><button type="button" onClick={() => setShowTranscript(false)} className="text-xs text-white/60 hover:text-white">Turn off</button></div><div className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm leading-6 text-white/85">{messages.length ? messages.slice(-6).map((message, index) => <p key={`${message.createdAt}-${index}`}><span className="font-medium text-white">{message.role === 'user' ? 'You' : person}:</span> {message.content}</p>) : <p className="text-white/45">Your conversation will appear here.</p>}</div><form onSubmit={onSubmit} className="mt-4 flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={callConnected ? 'Voice is live; type if needed…' : 'Text fallback if needed…'} className="min-w-0 flex-1 rounded-pill border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40" disabled={disabled} /><button type="submit" disabled={disabled || !input.trim()} className="rounded-pill bg-white px-4 py-2 text-xs font-medium text-ink disabled:opacity-40">Send</button></form></div>}</section>
}

export function PhoneCallFrame({ audioRef, person, messages: rawMessages, connected, ringing, connecting, paused, caption, error, input, setInput, onStart, onPause, onEnd, onSubmit, disabled }: { audioRef: React.RefObject<HTMLAudioElement>; person: string; messages: Message[]; connected: boolean; ringing: boolean; connecting: boolean; paused: boolean; caption: string; error: string; input: string; setInput: (value: string) => void; onStart: () => void; onPause: () => void; onEnd: () => void; onSubmit: (event: FormEvent) => void; disabled: boolean }) {
  const onMute = onPause
  const messages = rawMessages.filter((message, index, items) => items.findIndex((candidate) => candidate.role === message.role && candidate.content.replace(/\s+/g, ' ').trim().toLowerCase() === message.content.replace(/\s+/g, ' ').trim().toLowerCase()) === index)
  return <section className="mx-auto mb-5 max-w-3xl overflow-hidden rounded-[2rem] border border-[#D8D0C5] bg-[#F7F3ED] shadow-sm"><audio ref={audioRef} autoPlay /><div className="bg-[#1B2633] px-6 pb-7 pt-8 text-center text-white"><p className="text-xs font-medium uppercase tracking-[0.2em] text-white/55">Beckett phone practice</p><div className="mx-auto mt-5 flex h-24 w-24 items-center justify-center rounded-full bg-[#D89219] text-4xl font-medium">{person.trim().charAt(0).toUpperCase() || 'B'}</div><h2 className="mt-4 text-2xl">{person}</h2><p className="mt-2 text-sm text-white/60">{ringing ? 'Ringing…' : connecting ? 'Connecting…' : connected ? 'Call in progress' : 'Ready to call'}</p><div className="mx-auto mt-6 max-w-sm rounded-card bg-black/20 px-4 py-3 text-sm leading-6 text-white/85">{connected ? (caption || 'You’re connected. They will greet you first.') : ringing ? 'The call is ringing. They will greet you when it connects.' : 'Start the call to hear a brief hello, then respond naturally.'}</div></div><div className="px-6 py-5"><div className="flex justify-center gap-3"><button type="button" onClick={onStart} disabled={connecting || ringing || connected || disabled} className="rounded-full bg-[#D89219] px-6 py-3 text-sm font-medium text-white disabled:opacity-50">{ringing ? 'Ringing…' : connecting ? 'Connecting…' : connected ? 'Call connected' : 'Start call'}</button><button type="button" onClick={onMute} disabled={!connected || disabled} className="rounded-full border border-border px-5 py-3 text-sm disabled:opacity-40">{paused ? 'Resume' : 'Pause'}</button><button type="button" onClick={onEnd} disabled={!connected || disabled} className="rounded-full bg-red-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-40">End call</button></div>{error && <p className="mt-4 rounded-card bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">{error}</p>}<div className="mt-6 border-t border-border pt-5"><p className="text-xs font-medium uppercase tracking-wide text-ink-light">Live transcript</p><div className="mt-3 min-h-16 space-y-2 text-sm leading-6">{messages.slice(-4).map((message, index) => <p key={`${message.createdAt}-${index}`}><span className="font-medium">{message.role === 'user' ? 'You' : person}:</span> {message.content}</p>)}{connected && !messages.length && <p className="text-ink-light">They will greet you first, then your response will appear here.</p>}</div><form onSubmit={onSubmit} className="mt-4 flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Text fallback if needed…" className="min-w-0 flex-1 rounded-pill border border-border bg-white px-4 py-2 text-sm outline-none focus:border-primary" disabled={disabled} /><button type="submit" disabled={disabled || !input.trim()} className="rounded-pill border border-border bg-white px-4 py-2 text-xs font-medium disabled:opacity-40">Send text</button></form></div></div></section>
}

function PhoneCallFrameCompact({ audioRef, person, connected, ringing, connecting, paused, caption, error, input, setInput, onStart, onPause, onEnd, onSubmit, disabled }: { audioRef: React.RefObject<HTMLAudioElement>; person: string; connected: boolean; ringing: boolean; connecting: boolean; paused: boolean; caption: string; error: string; input: string; setInput: (value: string) => void; onStart: () => void; onPause: () => void; onEnd: () => void; onSubmit: (event: FormEvent) => void; disabled: boolean }) {
  return <section className="mx-auto mb-5 max-w-3xl overflow-hidden rounded-card border border-[#D8D0C5] bg-[#F7F3ED] shadow-sm"><audio ref={audioRef} autoPlay /><div className="bg-[#1B2633] px-6 pb-7 pt-8 text-center text-white"><p className="text-xs font-medium uppercase tracking-[0.2em] text-white/55">Beckett phone practice</p><div className="mx-auto mt-5 flex h-24 w-24 items-center justify-center rounded-full bg-[#D89219] text-4xl font-medium">{person.trim().charAt(0).toUpperCase() || 'B'}</div><h2 className="mt-4 text-2xl">{person}</h2><p className="mt-2 text-sm text-white/60">{ringing ? 'Ringing…' : connecting ? 'Connecting…' : connected ? 'Call in progress' : 'Ready to call'}</p><div className="mx-auto mt-6 max-w-xl rounded-card bg-black/20 px-4 py-3 text-sm leading-6 text-white/85">{connected ? (caption || 'You’re connected. They will greet you first.') : ringing ? 'The call is ringing. They will greet you when it connects.' : 'Start the call to hear a brief hello, then respond naturally.'}</div></div><div className="px-6 py-5"><div className="flex flex-wrap justify-center gap-3"><button type="button" onClick={onStart} disabled={connecting || ringing || connected || disabled} className="rounded-full bg-[#D89219] px-6 py-3 text-sm font-medium text-white disabled:opacity-50">{ringing ? 'Ringing…' : connecting ? 'Connecting…' : connected ? 'Call connected' : 'Start call'}</button><button type="button" onClick={onPause} disabled={!connected || disabled} className="rounded-full border border-border px-5 py-3 text-sm disabled:opacity-40">{paused ? 'Resume' : 'Pause'}</button><button type="button" onClick={onEnd} disabled={!connected || disabled} className="rounded-full bg-red-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-40">End call</button></div>{error && <p className="mt-4 rounded-card bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-900">{error}</p>}<form onSubmit={onSubmit} className="mx-auto mt-5 flex max-w-xl gap-2 border-t border-border pt-5"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Text fallback if needed…" className="min-w-0 flex-1 rounded-pill border border-border bg-white px-4 py-2 text-sm outline-none focus:border-primary" disabled={disabled} /><button type="submit" disabled={disabled || !input.trim()} className="rounded-pill border border-border bg-white px-4 py-2 text-xs font-medium disabled:opacity-40">Send text</button></form></div></section>
}
