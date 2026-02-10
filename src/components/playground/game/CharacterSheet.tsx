import type { CharacterGameState } from './gameState';

interface Props {
  character: CharacterGameState;
  isActive?: boolean;
}

const STAT_LABELS: Record<string, string> = {
  str: 'STR',
  agi: 'AGI',
  int: 'INT',
  cha: 'CHA',
  wil: 'WIL',
};

export default function CharacterSheet({ character, isActive }: Props) {
  const hpPercent = Math.round((character.hp / character.maxHp) * 100);
  const hpColor = hpPercent > 60 ? 'bg-emerald-500' : hpPercent > 30 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div
      class={`p-3 rounded-lg border transition-all ${
        character.eliminated
          ? 'border-slate-800 bg-surface-900/50 opacity-50'
          : isActive
            ? 'border-accent-500 bg-accent-500/5'
            : 'border-slate-700 bg-surface-800'
      }`}
    >
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-1.5">
          <span class="text-sm font-medium text-slate-100">{character.name}</span>
          {character.isUserControlled && (
            <span class="text-[10px] px-1 py-0.5 rounded bg-accent-500/20 text-accent-400">玩家</span>
          )}
        </div>
        {character.eliminated && (
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">淘汰</span>
        )}
      </div>

      {/* HP Bar */}
      <div class="mb-2">
        <div class="flex justify-between text-[10px] text-slate-400 mb-0.5">
          <span>HP</span>
          <span>{character.hp}/{character.maxHp}</span>
        </div>
        <div class="h-1.5 bg-surface-900 rounded-full overflow-hidden">
          <div
            class={`h-full ${hpColor} rounded-full transition-all duration-500`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div class="flex gap-1 mb-1.5">
        {Object.entries(character.stats).map(([key, val]) => (
          <div key={key} class="flex-1 text-center">
            <div class="text-[9px] text-slate-500">{STAT_LABELS[key]}</div>
            <div class="text-[11px] font-mono text-slate-300">{val}</div>
          </div>
        ))}
      </div>

      {/* Conditions */}
      {character.conditions.length > 0 && (
        <div class="flex flex-wrap gap-1">
          {character.conditions.map((c) => (
            <span key={c} class="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
