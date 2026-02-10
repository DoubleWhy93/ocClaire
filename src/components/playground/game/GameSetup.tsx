import { useState } from 'preact/hooks';
import type { ChatConfig } from '../../chat/chatApi';
import ApiKeyModal from '../../chat/ApiKeyModal';
import CharacterSelect from '../CharacterSelect';

export interface GameCharacterInfo {
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

export interface GameSetupResult {
  selectedIds: string[];
  userCharacterId: string | null;
  customCharacter: { name: string; description: string } | null;
  scenario: string;
  background: string;
}

interface Props {
  characters: GameCharacterInfo[];
  config: Partial<ChatConfig>;
  onStart: (setup: GameSetupResult) => void;
  onSaveKey: (provider: 'openai' | 'anthropic', apiKey: string) => void;
}

const SCENARIO_PRESETS = [
  { id: 'dungeon', label: '地下城探索', description: '一行人深入危险的地下迷宫，面对怪物和陷阱。' },
  { id: 'social', label: '社交谋略', description: '在一场盛大的宴会上，各方势力暗中角力，真相隐藏在华丽的面具之下。' },
  { id: 'survival', label: '荒野求生', description: '被困在荒无人烟的绝境中，必须团结合作才能生还。' },
  { id: 'custom', label: '自定义', description: '' },
];

export default function GameSetup({ characters, config, onStart, onSaveKey }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userMode, setUserMode] = useState<'observe' | 'pick' | 'custom'>('observe');
  const [userCharId, setUserCharId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [scenarioId, setScenarioId] = useState('dungeon');
  const [customBackground, setCustomBackground] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);

  const hasKey = !!config.apiKey;
  const preset = SCENARIO_PRESETS.find((s) => s.id === scenarioId)!;
  const background = scenarioId === 'custom' ? customBackground : preset.description;

  const canStart = selected.size >= 1 && hasKey && background.trim().length > 0
    && (userMode !== 'pick' || userCharId)
    && (userMode !== 'custom' || customName.trim());

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (userCharId === id) setUserCharId(null);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleStart = () => {
    if (!canStart) return;
    onStart({
      selectedIds: Array.from(selected),
      userCharacterId: userMode === 'pick' ? userCharId : null,
      customCharacter: userMode === 'custom' ? { name: customName.trim(), description: customDesc.trim() } : null,
      scenario: preset.label,
      background,
    });
  };

  const selectedChars = characters.filter((c) => selected.has(c.id));

  return (
    <div class="max-w-4xl mx-auto space-y-6">
      {/* Character Selection */}
      <CharacterSelect
        characters={characters}
        selected={selected}
        onToggle={handleToggle}
        max={5}
      />

      {/* User Role */}
      <div>
        <label class="text-sm font-medium text-slate-300 mb-2 block">你的角色</label>
        <div class="flex gap-2 mb-3">
          {([
            { id: 'observe', label: '旁观者', desc: '观看AI角色互动' },
            { id: 'pick', label: '扮演已有角色', desc: '选择一个角色亲自操控' },
            { id: 'custom', label: '自建角色', desc: '创建一个新角色加入' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setUserMode(opt.id)}
              class={`flex-1 p-3 rounded-lg border text-left transition-all ${
                userMode === opt.id
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-slate-700 bg-surface-800 hover:border-slate-600'
              }`}
            >
              <div class="text-sm font-medium text-slate-100">{opt.label}</div>
              <div class="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* Pick existing character */}
        {userMode === 'pick' && selectedChars.length > 0 && (
          <div class="flex gap-2 flex-wrap">
            {selectedChars.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setUserCharId(c.id)}
                class={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                  userCharId === c.id
                    ? 'bg-accent-500 text-white'
                    : 'bg-surface-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {userMode === 'pick' && selectedChars.length === 0 && (
          <p class="text-xs text-slate-500">请先选择角色</p>
        )}

        {/* Custom character */}
        {userMode === 'custom' && (
          <div class="space-y-2">
            <input
              type="text"
              value={customName}
              onInput={(e) => setCustomName((e.target as HTMLInputElement).value)}
              placeholder="角色名称"
              class="w-full px-3 py-2 bg-surface-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent-500 placeholder:text-slate-600"
            />
            <textarea
              value={customDesc}
              onInput={(e) => setCustomDesc((e.target as HTMLTextAreaElement).value)}
              placeholder="角色简介（性格、背景...）"
              rows={2}
              class="w-full px-3 py-2 bg-surface-900 border border-slate-700 rounded-lg text-sm text-slate-200 resize-none focus:outline-none focus:border-accent-500 placeholder:text-slate-600"
            />
          </div>
        )}
      </div>

      {/* Scenario */}
      <div>
        <label class="text-sm font-medium text-slate-300 mb-2 block">场景模板</label>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {SCENARIO_PRESETS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScenarioId(s.id)}
              class={`p-2 rounded-lg border text-sm transition-all ${
                scenarioId === s.id
                  ? 'border-accent-500 bg-accent-500/10 text-accent-400'
                  : 'border-slate-700 bg-surface-800 text-slate-400 hover:border-slate-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <textarea
          value={background}
          onInput={(e) => {
            if (scenarioId === 'custom') setCustomBackground((e.target as HTMLTextAreaElement).value);
          }}
          placeholder="描述场景背景..."
          rows={3}
          readOnly={scenarioId !== 'custom'}
          class={`w-full px-3 py-2 bg-surface-900 border border-slate-700 rounded-lg text-sm text-slate-200 resize-none focus:outline-none focus:border-accent-500 placeholder:text-slate-600 ${
            scenarioId !== 'custom' ? 'opacity-70' : ''
          }`}
        />
      </div>

      {/* Actions */}
      <div class="flex items-center gap-3">
        <button
          onClick={() => setShowKeyModal(true)}
          class="px-4 py-2 bg-surface-700 text-slate-300 rounded-lg text-sm hover:bg-surface-900 transition-colors"
        >
          {hasKey ? 'Change API Key' : 'Set API Key'}
        </button>

        <button
          onClick={handleStart}
          disabled={!canStart}
          class="px-6 py-2 bg-accent-500 text-white rounded-lg text-sm font-medium hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          开始游戏
        </button>
      </div>

      {showKeyModal && (
        <ApiKeyModal
          onSave={(p, k) => { onSaveKey(p, k); setShowKeyModal(false); }}
          onClose={() => setShowKeyModal(false)}
          initialProvider={config.provider || 'openai'}
        />
      )}
    </div>
  );
}
