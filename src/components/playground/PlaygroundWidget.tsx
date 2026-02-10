import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import type { ChatMessage, ChatConfig } from '../chat/chatApi';
import { sendMessage } from '../chat/chatApi';
import ApiKeyModal from '../chat/ApiKeyModal';
import CharacterSelect from './CharacterSelect';
import ConversationView, { type ConversationMessage } from './ConversationView';

export interface PlaygroundCharacter {
  id: string;
  name: string;
  species?: string;
  traits: string[];
  portrait?: string | null;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

interface Props {
  characters: PlaygroundCharacter[];
}

const COLOR_KEYS = ['indigo', 'emerald', 'amber', 'rose', 'cyan'];

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

function resolveModel(baseModel: string, provider: 'openai' | 'anthropic'): string {
  if (provider === 'anthropic' && baseModel.startsWith('gpt-')) return 'claude-sonnet-4-5-20250929';
  if (provider === 'openai' && baseModel.startsWith('claude-')) return 'gpt-4o-mini';
  return baseModel;
}

function buildSystemPrompt(char: PlaygroundCharacter, background: string, characterName: string): string {
  return `${char.systemPrompt}

【场景背景】
${background}

【对话规则】
你正在与其他角色对话。对话中其他角色的发言会以"[角色名]: 内容"的格式呈现。
你只需要以你自己（${characterName}）的身份回复，不要扮演其他角色。
不要在回复开头加上你自己的名字标签。`;
}

function buildMessagesForCharacter(
  charName: string,
  systemPrompt: string,
  history: ConversationMessage[],
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

  // Map history: this character's messages -> assistant, everyone else -> user with prefix
  let pending: ChatMessage | null = null;

  for (const msg of history) {
    const role: 'user' | 'assistant' = (!msg.isUser && msg.speaker === charName) ? 'assistant' : 'user';
    const content = role === 'assistant'
      ? msg.content
      : (msg.isUser ? `[用户]: ${msg.content}` : `[${msg.speaker}]: ${msg.content}`);

    // Merge consecutive same-role messages
    if (pending && pending.role === role) {
      pending.content += '\n' + content;
    } else {
      if (pending) messages.push(pending);
      pending = { role, content };
    }
  }
  if (pending) messages.push(pending);

  // Anthropic requires a user message after system — add a kickoff if history is empty
  if (messages.length === 1) {
    messages.push({ role: 'user', content: '（场景开始，请以你的角色身份开始对话。）' });
  }

  return messages;
}

function truncateHistory(history: ConversationMessage[], max: number = 30): ConversationMessage[] {
  if (history.length <= max) return history;
  return [...history.slice(0, 2), ...history.slice(-20)];
}

export default function PlaygroundWidget({ characters }: Props) {
  const [phase, setPhase] = useState<'setup' | 'conversation'>('setup');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [background, setBackground] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [config, setConfig] = useState<Partial<ChatConfig>>({});

  // Conversation state
  const [history, setHistory] = useState<ConversationMessage[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thinkingName, setThinkingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnIndex, setTurnIndex] = useState(0);
  const [userInput, setUserInput] = useState('');

  // Derived
  const activeChars = characters.filter((c) => selected.has(c.id));
  const characterColors: Record<string, string> = {};
  activeChars.forEach((c, i) => {
    characterColors[c.name] = COLOR_KEYS[i % COLOR_KEYS.length];
  });

  const hasKey = !!config.apiKey;

  useEffect(() => {
    setConfig(getStoredConfig());
  }, []);

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveKey = (provider: 'openai' | 'anthropic', apiKey: string) => {
    storeConfig(provider, apiKey);
    setConfig({ provider, apiKey });
    setShowKeyModal(false);
  };

  const generateTurn = useCallback(async (
    chars: PlaygroundCharacter[],
    currentHistory: ConversationMessage[],
    currentTurnIndex: number,
    cfg: ChatConfig,
    bg: string,
  ) => {
    const char = chars[currentTurnIndex % chars.length];
    const systemPrompt = buildSystemPrompt(char, bg, char.name);
    const truncated = truncateHistory(currentHistory);
    const messages = buildMessagesForCharacter(char.name, systemPrompt, truncated);

    // console.log(`[Playground] Turn ${currentTurnIndex} - ${char.name}`);
    // console.log(`[Playground] System prompt:`, systemPrompt);
    // console.log(`[Playground] Full messages:`, JSON.parse(JSON.stringify(messages)));

    setIsGenerating(true);
    setThinkingName(char.name);
    setError(null);

    try {
      const model = resolveModel(char.model, cfg.provider);
      const result = await sendMessage(messages, {
        ...cfg,
        model,
        temperature: char.temperature,
        maxTokens: char.maxTokens,
      } as ChatConfig, (partial) => {
        // Update last message in-place during streaming
        setHistory([...currentHistory, { speaker: char.name, content: partial }]);
      });

      const newHistory = [...currentHistory, { speaker: char.name, content: result }];
      setHistory(newHistory);
      setThinkingName(null);
      setIsGenerating(false);

      const nextTurn = currentTurnIndex + 1;
      setTurnIndex(nextTurn);

      // Auto-advance after delay if not paused
      setTimeout(() => {
        if (!isPausedRef.current) {
          generateTurn(chars, newHistory, nextTurn, cfg, bg);
        }
      }, 800);
    } catch (err: any) {
      setError(err.message || 'API 请求失败');
      setThinkingName(null);
      setIsGenerating(false);
    }
  }, []);

  const startConversation = () => {
    if (selected.size < 2 || !config.apiKey || !config.provider) return;
    setPhase('conversation');
    setHistory([]);
    setTurnIndex(0);
    setIsPaused(false);
    isPausedRef.current = false;
    setError(null);

    const chars = characters.filter((c) => selected.has(c.id));
    generateTurn(chars, [], 0, config as ChatConfig, background);
  };

  const handlePauseToggle = () => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    isPausedRef.current = newPaused;

    // If resuming, kick off next turn
    if (!newPaused && !isGenerating) {
      generateTurn(activeChars, history, turnIndex, config as ChatConfig, background);
    }
  };

  const handleUserSend = () => {
    const text = userInput.trim();
    if (!text || isGenerating) return;

    const newHistory = [...history, { speaker: '你', content: text, isUser: true }];
    setHistory(newHistory);
    setUserInput('');

    // Continue with next character's turn
    if (!isGenerating) {
      generateTurn(activeChars, newHistory, turnIndex, config as ChatConfig, background);
    }
  };

  const handleUserKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleUserSend();
    }
  };

  const handleRetry = () => {
    setError(null);
    generateTurn(activeChars, history, turnIndex, config as ChatConfig, background);
  };

  const handleReset = () => {
    setPhase('setup');
    setHistory([]);
    setTurnIndex(0);
    setIsPaused(false);
    isPausedRef.current = false;
    setThinkingName(null);
    setIsGenerating(false);
    setError(null);
  };

  // --- SETUP PHASE ---
  if (phase === 'setup') {
    return (
      <div class="max-w-4xl mx-auto space-y-6">
        <CharacterSelect
          characters={characters}
          selected={selected}
          onToggle={handleToggle}
        />

        <div>
          <label class="text-sm font-medium text-slate-300 mb-2 block">场景背景</label>
          <textarea
            value={background}
            onInput={(e) => setBackground((e.target as HTMLTextAreaElement).value)}
            placeholder="描述角色们所处的场景、情境或讨论的话题..."
            rows={4}
            class="w-full px-3 py-2 bg-surface-900 border border-slate-700 rounded-lg text-sm text-slate-200 resize-none focus:outline-none focus:border-accent-500 placeholder:text-slate-600"
          />
        </div>

        <div class="flex items-center gap-3">
          <button
            onClick={() => setShowKeyModal(true)}
            class="px-4 py-2 bg-surface-700 text-slate-300 rounded-lg text-sm hover:bg-surface-900 transition-colors"
          >
            {hasKey ? 'Change API Key' : 'Set API Key'}
          </button>

          <button
            onClick={startConversation}
            disabled={selected.size < 2 || !hasKey}
            class="px-6 py-2 bg-accent-500 text-white rounded-lg text-sm font-medium hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            开始对话
          </button>
        </div>

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

  // --- CONVERSATION PHASE ---
  return (
    <div class="max-w-4xl mx-auto">
      <div class="border border-slate-700 rounded-xl bg-surface-800 overflow-hidden">
        {/* Header */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-surface-900/50">
          <div class="flex items-center gap-2 flex-wrap">
            {activeChars.map((c, i) => (
              <span
                key={c.id}
                class={`text-xs px-2 py-1 rounded-full border ${
                  `border-${COLOR_KEYS[i % COLOR_KEYS.length]}-400/50 text-${COLOR_KEYS[i % COLOR_KEYS.length]}-400`
                }`}
              >
                {c.name}
              </span>
            ))}
          </div>
          <div class="flex items-center gap-2">
            <button
              onClick={handlePauseToggle}
              class="text-xs px-3 py-1.5 rounded-lg bg-surface-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {isPaused ? '继续' : '暂停'}
            </button>
            <button
              onClick={handleReset}
              class="text-xs px-3 py-1.5 rounded-lg bg-surface-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              重新开始
            </button>
          </div>
        </div>

        {/* Conversation */}
        <ConversationView
          messages={history}
          thinkingName={thinkingName}
          characterColors={characterColors}
        />

        {/* Error */}
        {error && (
          <div class="px-4 pb-2">
            <div class="text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={handleRetry}
                class="ml-2 text-red-300 underline hover:text-red-200"
              >
                重试
              </button>
            </div>
          </div>
        )}

        {/* User input */}
        <div class="border-t border-slate-700 p-3">
          <div class="flex gap-2">
            <textarea
              value={userInput}
              onInput={(e) => setUserInput((e.target as HTMLTextAreaElement).value)}
              onKeyDown={handleUserKeyDown}
              placeholder="插入一句话..."
              rows={1}
              class="flex-1 px-3 py-2 bg-surface-900 border border-slate-700 rounded-lg text-sm text-slate-200 resize-none focus:outline-none focus:border-accent-500 placeholder:text-slate-600"
            />
            <button
              onClick={handleUserSend}
              disabled={!userInput.trim() || isGenerating}
              class="px-4 py-2 bg-accent-500 text-white rounded-lg text-sm font-medium hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
