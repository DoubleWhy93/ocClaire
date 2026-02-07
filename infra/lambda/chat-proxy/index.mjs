// Optional Lambda proxy for chat API
// Deploy behind API Gateway for server-side API key management
//
// Environment variables:
//   OPENAI_API_KEY - OpenAI API key
//   ALLOWED_ORIGINS - Comma-separated list of allowed origins (CORS)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',');

export async function handler(event) {
  const origin = event.headers?.origin || '*';
  const corsOrigin = ALLOWED_ORIGINS.includes('*') ? '*' : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  try {
    const body = JSON.parse(event.body);
    const { messages, model = 'gpt-4o-mini', temperature = 0.8, maxTokens = 1024 } = body;

    if (!messages || !Array.isArray(messages)) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'messages array required' }),
      };
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        statusCode: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.error?.message || 'OpenAI API error' }),
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
