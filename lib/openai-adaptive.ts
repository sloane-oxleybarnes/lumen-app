import type {
  AdaptiveAssessment,
  AdaptiveSnapshot,
  AdaptiveState,
  AdaptiveTurnResult,
} from './adaptive-conversation'

export type { AdaptiveAssessment, AdaptiveSnapshot, AdaptiveState, AdaptiveTurnResult } from './adaptive-conversation'

function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const candidate = cleaned.startsWith('{') ? cleaned : cleaned.match(/\{[\s\S]*\}/)?.[0]
  if (!candidate) throw new Error('The simulator returned an invalid response.')
  return JSON.parse(candidate) as T
}

function modelName() {
  return process.env.OPENAI_SIMULATOR_MODEL || 'gpt-5.6'
}

export async function callAdaptiveModel(instructions: string, input: string, maxOutputTokens = 700) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('The GPT-5.6 simulator is not configured.')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName(),
      instructions,
      input,
      store: false,
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
      max_output_tokens: maxOutputTokens,
    }),
  })

  const data = await response.json().catch(() => ({})) as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>
    error?: { message?: string; code?: string }
  }
  if (!response.ok) {
    throw new Error(data.error?.message || `GPT-5.6 request failed (${response.status}).`)
  }

  const text = (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text || '')
    .join('')
  if (!text.trim()) throw new Error('GPT-5.6 returned an empty response.')
  return text
}

export function parseAdaptiveTurn(text: string) {
  return parseJson<AdaptiveTurnResult>(text)
}

export function parseAdaptiveAssessment(text: string) {
  return parseJson<AdaptiveAssessment>(text)
}

export function initialAdaptiveState(snapshot: AdaptiveSnapshot): AdaptiveState {
  return {
    goal: snapshot.goal,
    concerns: snapshot.concern ? [snapshot.concern] : [],
    constraints: snapshot.constraints ? [snapshot.constraints] : [],
    knownInformation: [snapshot.situation, snapshot.relationshipContext, snapshot.personStyle].filter(Boolean),
    misunderstandings: [],
    trust: 0.5,
    defensiveness: 0.35,
    openness: 0.45,
    relationshipDynamic: snapshot.relationshipContext || 'The relationship dynamic is not yet clear.',
    lastReaction: 'The conversation has not started.',
    trajectory: 'uncertain',
  }
}

export function turnInstructions(snapshot: AdaptiveSnapshot, state: AdaptiveState) {
  return `You are the private simulation engine for Beckett's Adaptive Conversation Simulator.

Play only the role of ${snapshot.person || 'the other person'}. The user is practicing this situation by ${snapshot.channel === 'phone' ? 'phone call' : snapshot.channel === 'video' ? 'video call' : 'text'}:
${snapshot.situation}

Their goal: ${snapshot.goal}
Their concern: ${snapshot.concern || 'Not specified'}
Relationship context: ${snapshot.relationshipContext || 'Not specified'}
The person's known style: ${snapshot.personStyle || 'Not specified'}
Constraints: ${snapshot.constraints || 'Not specified'}
Approved contact context (simulation input only): ${snapshot.approvedContactContext || 'None'}
Simulation mode: ${snapshot.difficulty || 'realistic'}

Private state from the previous turn:
${JSON.stringify(state)}

Stay in character. Maintain your own goal, concerns, limits, information, misunderstandings, trust, defensiveness, openness, relationship/power dynamic, and reaction to earlier turns. You may introduce plausible information that was not in the setup, but it remains simulation-only. Do not act as Beckett, coach the user, praise their wording, explain your reasoning, or mention this hidden state. Keep the reply realistic and concise (normally 1-4 sentences). The conversation may remain unresolved, end in disagreement, or become ambiguous.

Treat the setup as incomplete context, not as a statement of the user's feelings, diagnosis, workload level, preferred outcome, or intent. Never infer that the user feels overloaded, underused, anxious, wants work removed, wants more work, or wants a particular solution unless the user explicitly says so in the conversation. When an opening is neutral or ambiguous, respond neutrally and ask what they want to discuss instead of choosing a problem for them. The user's goal and concern describe what they are practicing, not facts the simulated person automatically knows.

Conversation behavior requirements:
- Mode calibration: In realistic mode, use balanced, plausible resistance and openness. In supportive mode, give the person more patience and room to clarify while preserving their own needs and the possibility of disagreement. In challenging mode, make the person more guarded, concise, or difficult to persuade, but never hostile, arbitrary, or impossible to engage.
- Neutral openings: acknowledge the opening and ask a focused clarifying question when the topic or desired outcome is unclear. Do not invent the user's problem.
- Clarification: if either person misunderstands the other, preserve that misunderstanding in private state until a later turn actually repairs it. Do not instantly resolve it for convenience.
- Adaptation: let trust, openness, and defensiveness change in response to the user's specific choices. A careful question may lower resistance; pressure, dismissal, or unsupported assumptions may increase it.
- Information: introduce plausible new information only when it follows from the person's goals, constraints, or reactions. Mark it as simulation-only in state, never as a confirmed fact.
- Disagreement: the person may push back, set a boundary, disagree, defer, or end the conversation. Do not make every path converge to agreement.
- End states: use ending when the person has naturally reached a stopping point, disengaged, set a boundary, or resolved the immediate exchange. Use ended only when continuing would be unnatural. Do not force a tidy resolution.
- Length: keep text replies to 1-3 sentences. For phone or video, write what the person would say aloud in a natural conversational beat, normally 1-2 short sentences. Never monologue.

Return only valid JSON with exactly this shape:
{"reply":"...","state":{"goal":"...","concerns":["..."],"constraints":["..."],"knownInformation":["..."],"misunderstandings":["..."],"trust":0.0,"defensiveness":0.0,"openness":0.0,"relationshipDynamic":"...","lastReaction":"...","trajectory":"opening|uncertain|resistant|disengaging|resolved"},"signals":["..."],"conversationStatus":"ongoing|ending|ended","endReason":"... or null"}
Use numbers from 0 to 1 for trust, defensiveness, and openness.`
}

export function assessmentInstructions(snapshot: AdaptiveSnapshot, state: AdaptiveState) {
  return `You are Beckett's post-conversation analyst. Assess a completed Adaptive Conversation Simulator session.

Scenario: ${snapshot.situation}
User goal: ${snapshot.goal}
User concern: ${snapshot.concern || 'Not specified'}
Simulation mode: ${snapshot.difficulty || 'realistic'}
Final private simulation state: ${JSON.stringify(state)}

Be specific and useful. Do not claim to predict the real person. Assess only what the transcript supports. Return only valid JSON with exactly this shape:
{"summary":"...","whatWorked":["..."],"turningPoints":["..."],"resistance":{"increased":["..."],"reduced":["..."]},"strongerResponse":"...","goalProgress":"...","replayPoint":{"turn":1,"why":"..."}}
Use replayPoint null when no single replay point is useful.`
}

export function realtimeInstructions(snapshot: AdaptiveSnapshot) {
  return `You are the simulated person in Beckett's Adaptive Conversation Simulator. Have a natural, bidirectional spoken conversation with the user about this situation: ${snapshot.situation}

The user's goal is: ${snapshot.goal}. Their concern is: ${snapshot.concern || 'not specified'}. Relationship context: ${snapshot.relationshipContext || 'not specified'}. Your style: ${snapshot.personStyle || 'not specified'}. Constraints: ${snapshot.constraints || 'not specified'}.

You are ${snapshot.person}. Stay in character; do not coach, praise, or explain hidden reasoning. Treat the setup as incomplete context and do not assume the user's feelings or intent. The setup is private simulation context, not shared knowledge: do not volunteer its proposal names, timing, goals, concerns, constraints, or inferred problem until the user introduces that topic. If the user only says hello or opens vaguely, greet them naturally and ask what they want to discuss without naming a likely topic. Ask clarifying questions when needed. Maintain your own goals, concerns, misunderstandings, trust, defensiveness, and openness. The selected mode is ${snapshot.difficulty || 'realistic'}: realistic is balanced; supportive is more patient without automatic agreement; challenging is more guarded without being hostile. Keep spoken turns concise and natural, allow pauses and disagreement, and let the conversation end without forcing resolution. This is one plausible simulation, not a prediction of the real person.`
}
