export type AdaptiveScenarioType = 'general' | 'contact'
export type AdaptiveDifficulty = 'realistic'
export type AdaptiveSessionStatus = 'active' | 'completed' | 'abandoned'
export type AdaptiveTurnLifecycle = 'setup' | 'ready' | 'responding' | 'paused' | 'help' | 'completed' | 'abandoned'
export type AdaptiveTrajectory = 'opening' | 'uncertain' | 'resistant' | 'disengaging' | 'resolved'

export type AdaptiveSnapshot = {
  scenarioType: AdaptiveScenarioType
  contactId?: string | null
  person: string
  situation: string
  goal: string
  concern: string
  relationshipContext: string
  personStyle: string
  constraints: string
  approvedContactContext?: string
}

export type AdaptiveState = {
  goal: string
  concerns: string[]
  constraints: string[]
  knownInformation: string[]
  misunderstandings: string[]
  trust: number
  defensiveness: number
  openness: number
  relationshipDynamic: string
  lastReaction: string
  trajectory: AdaptiveTrajectory
}

export type AdaptiveTranscriptItem = {
  role: 'user' | 'simulated_person'
  content: string
  turn: number
  createdAt: string
}

export type AdaptiveReplayPoint = {
  turn: number
  why: string
}

export type AdaptiveAssessment = {
  summary: string
  whatWorked: string[]
  turningPoints: string[]
  resistance: { increased: string[]; reduced: string[] }
  strongerResponse: string
  goalProgress: string
  replayPoint: AdaptiveReplayPoint | null
}

export type AdaptiveTurnResult = {
  reply: string
  state: AdaptiveState
  signals: string[]
}

export type AdaptiveSession = {
  id: string
  userId?: string
  contactId?: string | null
  scenarioType: AdaptiveScenarioType
  difficulty: AdaptiveDifficulty
  status: AdaptiveSessionStatus
  lifecycle: AdaptiveTurnLifecycle
  setupSnapshot: AdaptiveSnapshot
  simulationState: AdaptiveState
  transcript: AdaptiveTranscriptItem[]
  assessment: AdaptiveAssessment | null
  createdAt?: string
  updatedAt?: string
  completedAt?: string | null
}
