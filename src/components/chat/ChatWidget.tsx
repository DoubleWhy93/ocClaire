import { useState, useRef, useEffect } from 'preact/hooks';
import type { ChatMessage as ChatMsg, ChatConfig } from './chatApi';
import { sendMessage } from './chatApi';
import ChatMessage from './ChatMessage';
import ApiKeyModal from './ApiKeyModal';

interface Props {
  characterId: string;
  characterName: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

function getStoredConfig(): Partial<ChatConfig> {
  try {
    const raw = localStorage.getItem('oc-chat-config');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function storeConfig(provider: 'openai' | 'anthropic', apiKey: string) {
  localStorage.setItem('oc-chat-config', JSON.stringify({ provider, apiKey }));
}

export default function ChatWidget({
  characterName,
  systemPrompt,
  model,
  temperature,
  maxTokens,
}: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [config, setConfig] = useState<Partial<ChatConfig>>({});

  // Load stored config after mount to avoid SSR hydration mismatch
  useEffect(() => {
    setConfig(getStoredConfig());
  }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasKey = !!config.apiKey;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSaveKey = (provider: 'openai' | 'anthropic', apiKey: string) => {
    storeConfig(provider, apiKey);
    setConfig({ provider, apiKey });
    setShowKeyModal(false);
    setError(null);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading || !config.apiKey || !config.provider) return;

    const userMsg: ChatMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    // Build full conversation with system prompt
    const fullConversation: ChatMsg[] = [
      { role: 'system', content: systemPrompt },
      ...newMessages,
    ];

    // Determine model based on provider
    let chatModel = model;
    if (config.provider === 'anthropic' && model.startsWith('gpt-')) {
      chatModel = 'claude-sonnet-4-5-20250929';
    } else if (config.provider === 'openai' && model.startsWith('claude-')) {
      chatModel = 'gpt-4o-mini';
    }

    try {
      const assistantPlaceholder: ChatMsg = { role: 'assistant', content: '' };
      setMessages([...newMessages, assistantPlaceholder]);

      const result = await sendMessage(fullConversation, {
        provider: config.provider,
        apiKey: config.apiKey,
        model: chatModel,
        temperature,
        maxTokens,
      }, (partial) => {
        setMessages([...newMessages, { role: 'assistant', content: partial }]);
      });

      setMessages([...newMessages, { role: 'assistant', content: result }]);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      setMessages(newMessages); // Remove placeholder
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div class="border border-slate-700 rounded-xl bg-surface-800 overflow-hidden">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-surface-900/50">
        <div>
          <h3 class="text-sm font-bold text-slate-100">Chat with {characterName}</h3>
          <p class="text-xs text-slate-500">Powered by your own API key</p>
        </div>
        <button
          onClick={() => setShowKeyModal(true)}
          class="text-xs px-3 py-1.5 rounded-lg bg-surface-700 text-slate-400 hover:text-slate-200 transition-colors"
        >
          {hasKey ? 'Change Key' : 'Set API Key'}
        </button>
      </div>

      {/* Messages area */}
      <div class="h-80 overflow-y-auto p-4 space-y-1">
        {!hasKey && messages.length === 0 && (
          <div class="flex items-center justify-center h-full text-center">
            <div>
              <p class="text-slate-500 text-sm mb-3">Set your API key to start chatting with {characterName}.</p>
              <button
                onClick={() => setShowKeyModal(true)}
                class="px-4 py-2 bg-accent-500 text-white rounded-lg text-sm hover:bg-accent-600 transition-colors"
              >
                Set API Key
              </button>
            </div>
          </div>
        )}

        {hasKey && messages.length === 0 && (
          <div class="flex items-center justify-center h-full">
            <p class="text-slate-500 text-sm">Say hello to {characterName}!</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            role={msg.role as 'user' | 'assistant'}
            content={msg.content}
            characterName={msg.role === 'assistant' ? characterName : undefined}
          />
        ))}

        {error && (
          <div class="text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div class="border-t border-slate-700 p-3">
        <div class="flex gap-2">
          <textarea
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyDown={handleKeyDown}
            placeholder={hasKey ? `Message ${characterName}...` : 'Set your API key first'}
            disabled={!hasKey || isLoading}
            rows={1}
            class="flex-1 px-3 py-2 bg-surface-900 border border-slate-700 rounded-lg text-sm text-slate-200 resize-none focus:outline-none focus:border-accent-500 placeholder:text-slate-600 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!hasKey || !input.trim() || isLoading}
            class="px-4 py-2 bg-accent-500 text-white rounded-lg text-sm font-medium hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
      </div>

      {/* API Key Modal */}
      {showKeyModal && (
        <ApiKeyModal
          onSave={handleSaveKey}
          onClose={() => setShowKeyModal(false)}
          initialProvider={config.provider || 'openai'}
        />
      )}
    </div>
  );
}
