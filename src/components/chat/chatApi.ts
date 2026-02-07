export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  lambdaEndpoint?: string;
}

export async function sendMessage(
  messages: ChatMessage[],
  config: ChatConfig,
  onChunk?: (text: string) => void,
): Promise<string> {
  if (config.lambdaEndpoint) {
    return sendViaLambda(messages, config, onChunk);
  }
  if (config.provider === 'anthropic') {
    return sendToAnthropic(messages, config, onChunk);
  }
  return sendToOpenAI(messages, config, onChunk);
}

async function sendToOpenAI(
  messages: ChatMessage[],
  config: ChatConfig,
  onChunk?: (text: string) => void,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: !!onChunk,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
  }

  if (onChunk && response.body) {
    return readOpenAIStream(response.body, onChunk);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content ?? '';
}

async function readOpenAIStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onChunk(full);
        }
      } catch {
        // skip malformed chunks
      }
    }
  }
  return full;
}

async function sendToAnthropic(
  messages: ChatMessage[],
  config: ChatConfig,
  onChunk?: (text: string) => void,
): Promise<string> {
  // Separate system message from conversation
  const systemMsg = messages.find((m) => m.role === 'system');
  const conversationMsgs = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      system: systemMsg?.content ?? '',
      messages: conversationMsgs,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: !!onChunk,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
  }

  if (onChunk && response.body) {
    return readAnthropicStream(response.body, onChunk);
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? '';
}

async function readAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(trimmed.slice(6));
        if (json.type === 'content_block_delta' && json.delta?.text) {
          full += json.delta.text;
          onChunk(full);
        }
      } catch {
        // skip
      }
    }
  }
  return full;
}

async function sendViaLambda(
  messages: ChatMessage[],
  config: ChatConfig,
  onChunk?: (text: string) => void,
): Promise<string> {
  const response = await fetch(config.lambdaEndpoint!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Lambda proxy error: ${response.status}`);
  }

  // Lambda returns non-streaming for simplicity
  const data = await response.json();
  const text = data.content ?? data.message ?? '';
  if (onChunk) onChunk(text);
  return text;
}
