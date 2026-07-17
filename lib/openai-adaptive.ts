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

Play only the role of ${snapshot.person || 'the other person'}. The user is practicing this situation:
${snapshot.situation}

Their goal: ${snapshot.goal}
Their concern: ${snapshot.concern || 'Not specified'}
Relationship context: ${snapshot.relationshipContext || 'Not specified'}
The person's known style: ${snapshot.personStyle || 'Not specified'}
Constraints: ${snapshot.constraints || 'Not specified'}
Approved contact context (simulation input only): ${snapshot.approvedContactContext || 'None'}

Private state from the previous turn:
${JSON.stringify(state)}

Stay in character. Maintain your own goal, concerns, limits, information, misunderstandings, trust, defensiveness, openness, relationship/power dynamic, and reaction to earlier turns. You may introduce plausible information that was not in the setup, but it remains simulation-only. Do not act as Beckett, coach the user, praise their wording, explain your reasoning, or mention this hidden state. Keep the reply realistic and concise (normally 1-4 sentences). The conversation may remain unresolved, end in disagreement, or become ambiguous.

Treat the setup as incomplete context, not as a statement of the user's feelings, diagnosis, workload level, preferred outcome, or intent. Never infer that the user feels overloaded, underused, anxious, wants work removed, wants more work, or wants a particular solution unless the user explicitly says so in the conversation. When an opening is neutral or ambiguous, respond neutrally and ask what they want to discuss instead of choosing a problem for them. The user's goal and concern describe what they are practicing, not facts the simulated person automatically knows.

Return only valid JSON with exactly this shape:
{"reply":"...","state":{"goal":"...","concerns":["..."],"constraints":["..."],"knownInformation":["..."],"misunderstandings":["..."],"trust":0.0,"defensiveness":0.0,"openness":0.0,"relationshipDynamic":"...","lastReaction":"...","trajectory":"opening|uncertain|resistant|disengaging|resolved"},"signals":["..."]}
Use numbers from 0 to 1 for trust, defensiveness, and openness.`
}

export function assessmentInstructions(snapshot: AdaptiveSnapshot, state: AdaptiveState) {
  return `You are Beckett's post-conversation analyst. Assess a completed Adaptive Conversation Simulator session.

Scenario: ${snapshot.situation}
User goal: ${snapshot.goal}
User concern: ${snapshot.concern || 'Not specified'}
Final private simulation state: ${JSON.stringify(state)}

Be specific and useful. Do not claim to predict the real person. Assess only what the transcript supports. Return only valid JSON with exactly this shape:
{"summary":"...","whatWorked":["..."],"turningPoints":["..."],"resistance":{"increased":["..."],"reduced":["..."]},"strongerResponse":"...","goalProgress":"...","replayPoint":{"turn":1,"why":"..."}}
Use replayPoint null when no single replay point is useful.`
}
