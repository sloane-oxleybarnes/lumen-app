import { createHash, createHmac } from 'crypto'

export type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ClaudeResponse = {
  content?: { text?: string }[]
}

function getAiProvider() {
  return (process.env.AI_PROVIDER || process.env.LLM_PROVIDER || 'anthropic').trim().toLowerCase()
}

function getAnthropicModel() {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
}

function getBedrockModel() {
  return process.env.BEDROCK_MODEL_ID || process.env.AWS_BEDROCK_MODEL_ID || getAnthropicModel()
}

function sha256Hex(input: string) {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

function hmac(key: Buffer | string, input: string) {
  return createHmac('sha256', key).update(input, 'utf8').digest()
}

function hmacHex(key: Buffer | string, input: string) {
  return createHmac('sha256', key).update(input, 'utf8').digest('hex')
}

function awsDateParts(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  }
}

function getAwsSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, service)
  return hmac(kService, 'aws4_request')
}

async function callAnthropicDirect(system: string | null, messages: AnthropicMessage[], maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Anthropic API key not configured.')

  const body: Record<string, unknown> = {
    model: getAnthropicModel(),
    max_tokens: maxTokens,
    messages,
  }
  if (system) body.system = system

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err?.error?.message || `Anthropic error ${res.status}`)
  }

  const data = await res.json() as ClaudeResponse
  return (data.content || []).map((block) => block.text || '').join('')
}

async function callAnthropicBedrock(system: string | null, messages: AnthropicMessage[], maxTokens: number) {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const sessionToken = process.env.AWS_SESSION_TOKEN
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
  const modelId = getBedrockModel()

  if (!accessKeyId || !secretAccessKey) throw new Error('AWS credentials are not configured for Bedrock.')
  if (!modelId) throw new Error('BEDROCK_MODEL_ID is not configured.')

  const body: Record<string, unknown> = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    messages,
  }
  if (system) body.system = system

  const payload = JSON.stringify(body)
  const service = 'bedrock'
  const host = `bedrock-runtime.${region}.amazonaws.com`
  const path = `/model/${encodeURIComponent(modelId)}/invoke`
  // AWS SigV4 canonical URI encoding double-encodes path parameter escapes.
  const canonicalPath = path.replace(/%/g, '%25')
  const endpoint = `https://${host}${path}`
  const { amzDate, dateStamp } = awsDateParts()
  const payloadHash = sha256Hex(payload)
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
  if (sessionToken) headers['x-amz-security-token'] = sessionToken

  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join('')
  const signedHeaders = signedHeaderNames.join(';')
  const canonicalRequest = ['POST', canonicalPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')
  const signingKey = getAwsSigningKey(secretAccessKey, dateStamp, region, service)
  const signature = hmacHex(signingKey, stringToSign)

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: payload,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; error?: { message?: string } }
    throw new Error(err?.error?.message || err?.message || `Bedrock error ${res.status}`)
  }

  const data = await res.json() as ClaudeResponse
  return (data.content || []).map((block) => block.text || '').join('')
}

export async function callAnthropic(system: string | null, messages: AnthropicMessage[], maxTokens: number) {
  if (getAiProvider() !== 'bedrock') {
    return callAnthropicDirect(system, messages, maxTokens)
  }

  try {
    return await callAnthropicBedrock(system, messages, maxTokens)
  } catch (error) {
    if (process.env.AI_PROVIDER_DISABLE_FALLBACK === 'true' || !process.env.ANTHROPIC_API_KEY) throw error
    console.error('Bedrock call failed; falling back to Anthropic direct', {
      message: error instanceof Error ? error.message : String(error),
    })
    return callAnthropicDirect(system, messages, maxTokens)
  }
}
