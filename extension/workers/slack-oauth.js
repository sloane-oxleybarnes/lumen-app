// Cloudflare Worker — deploy to lumen-slack.sloane-oxleyhase.workers.dev
// Required Worker secrets: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET
// KV namespace binding (optional for token caching): SLACK_TOKENS

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/auth-url')) {
        const redirectUri = url.searchParams.get('redirect_uri') || '';
        if (!env.SLACK_CLIENT_ID) return json({ error: 'Slack client ID not configured' }, 500);

        const authUrl = 'https://slack.com/oauth/v2/authorize?' + new URLSearchParams({
          client_id: env.SLACK_CLIENT_ID,
          scope: 'commands,chat:write,assistant:write,im:history,im:write',
          user_scope: 'channels:history,groups:history,im:history,mpim:history,users:read',
          redirect_uri: redirectUri,
        }).toString();

        return json({ auth_url: authUrl });
      }
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const { code, redirect_uri } = body;
    if (!code) return json({ error: 'Authorization code required' }, 400);

    // Exchange code for token with Slack
    const params = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: redirect_uri || '',
    });

    const slackRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const slackData = await slackRes.json();

    if (!slackData.ok) {
      return json({ ok: false, error: slackData.error || 'Slack auth failed' }, 400);
    }

    return json(slackData);
  },
};
