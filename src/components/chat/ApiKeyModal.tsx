import { useState } from 'preact/hooks';

interface Props {
  onSave: (provider: 'openai' | 'anthropic', apiKey: string) => void;
  onClose: () => void;
  initialProvider?: 'openai' | 'anthropic';
}

export default function ApiKeyModal({ onSave, onClose, initialProvider = 'openai' }: Props) {
  const [provider, setProvider] = useState<'openai' | 'anthropic'>(initialProvider);
  const [key, setKey] = useState('');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (key.trim()) {
      onSave(provider, key.trim());
    }
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="bg-surface-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <h3 class="text-lg font-bold text-slate-100 mb-1">Enter API Key</h3>
        <p class="text-sm text-slate-400 mb-4">
          Your key is stored in your browser only and sent directly to the LLM provider. It never touches our servers.
        </p>

        <form onSubmit={handleSubmit}>
          <div class="mb-4">
            <label class="text-sm text-slate-300 mb-2 block">Provider</label>
            <div class="flex gap-2">
              {(['openai', 'anthropic'] as const).map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setProvider(p)}
                  class={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    provider === p
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p === 'openai' ? 'OpenAI' : 'Anthropic'}
                </button>
              ))}
            </div>
          </div>

          <div class="mb-4">
            <label class="text-sm text-slate-300 mb-2 block">
              {provider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key
            </label>
            <input
              type="password"
              value={key}
              onInput={(e) => setKey((e.target as HTMLInputElement).value)}
              placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              class="w-full px-3 py-2 bg-surface-900 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-accent-500 placeholder:text-slate-600"
              autoFocus
            />
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              class="flex-1 py-2 px-4 bg-surface-700 text-slate-300 rounded-lg text-sm hover:bg-surface-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!key.trim()}
              class="flex-1 py-2 px-4 bg-accent-500 text-white rounded-lg text-sm hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
