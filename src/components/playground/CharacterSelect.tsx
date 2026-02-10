interface CharacterInfo {
  id: string;
  name: string;
  species?: string;
  traits: string[];
  portrait?: string | null;
}

interface Props {
  characters: CharacterInfo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  max?: number;
}

export default function CharacterSelect({ characters, selected, onToggle, max = 5 }: Props) {
  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-medium text-slate-300">选择角色（2-{max}位）</h3>
        <span class="text-xs text-slate-500">已选择 {selected.size}/{max}</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {characters.map((c) => {
          const isSelected = selected.has(c.id);
          const atMax = selected.size >= max && !isSelected;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => !atMax && onToggle(c.id)}
              disabled={atMax}
              class={`relative p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-accent-500 bg-accent-500/10'
                  : atMax
                    ? 'border-slate-700/50 bg-surface-800/50 opacity-50 cursor-not-allowed'
                    : 'border-slate-700 bg-surface-800 hover:border-slate-600'
              }`}
            >
              {isSelected && (
                <div class="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-500 flex items-center justify-center">
                  <svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={3}>
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              <div class="text-sm font-medium text-slate-100 mb-1">{c.name}</div>
              {c.species && <div class="text-xs text-slate-500 mb-1">{c.species}</div>}
              {c.traits.length > 0 && (
                <div class="flex flex-wrap gap-1">
                  {c.traits.slice(0, 3).map((t) => (
                    <span key={t} class="text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-slate-400">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
