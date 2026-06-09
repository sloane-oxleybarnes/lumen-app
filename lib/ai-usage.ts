import { supabaseAdmin } from './server-admin'

const DEFAULT_BETA_DAILY_LIMIT = 15
const DEFAULT_BETA_DAILY_COURSE_LIMIT = 40

export class AiUsageLimitError extends Error {
  status = 429
  remaining = 0

  constructor(public limit: number, kind: 'analysis' | 'course' = 'analysis') {
    super(
      kind === 'course'
        ? `Daily beta course practice limit reached. You get ${limit} Beckett course coaching calls per day during beta.`
        : `Daily beta AI limit reached. You get ${limit} Beckett analyses per day during beta.`
    )
  }
}

export function getDailyAiLimit() {
  const configured = Number(process.env.BETA_DAILY_AI_LIMIT)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_BETA_DAILY_LIMIT
}

export function getDailyCourseAiLimit() {
  const configured = Number(process.env.BETA_DAILY_COURSE_LIMIT)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_BETA_DAILY_COURSE_LIMIT
}

function startOfUtcDay() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

export async function getAiUsageToday(userId: string, source?: string) {
  let query = supabaseAdmin
    .from('ai_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfUtcDay())

  query = source ? query.eq('source', source) : query.neq('source', 'course')

  const { count, error } = await query

  if (error) throw error
  return count || 0
}

export async function recordAiUsage(userId: string, input: {
  source: string
  action: string
  tokenEstimate?: number
  metadata?: Record<string, unknown>
}) {
  const isCourse = input.source === 'course'
  const limit = isCourse ? getDailyCourseAiLimit() : getDailyAiLimit()
  const used = await getAiUsageToday(userId, isCourse ? 'course' : undefined)

  if (used >= limit) {
    throw new AiUsageLimitError(limit, isCourse ? 'course' : 'analysis')
  }

  const { error } = await supabaseAdmin.from('ai_usage_events').insert({
    user_id: userId,
    source: input.source,
    action: input.action,
    token_estimate: input.tokenEstimate || 1,
    metadata: input.metadata || {},
  })

  if (error) throw error

  return {
    limit,
    used: used + 1,
    remaining: Math.max(limit - used - 1, 0),
  }
}
