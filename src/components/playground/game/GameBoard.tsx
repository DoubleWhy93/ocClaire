import { useEffect, useRef } from 'preact/hooks';
import type { GameState, GameEvent, DiceRoll } from './gameState';
import { formatRoll } from './gameState';
import CharacterSheet from './CharacterSheet';
import DiceRoller from './DiceRoller';

interface Props {
  gameState: GameState;
  currentTurnCharId: string | null;
  isGenerating: boolean;
  thinkingName: string | null;
  lastRoll: DiceRoll | null;
  error: string | null;
  isPaused: boolean;
  userActionNeeded: boolean;
  onUserAction: (actionType: string, description: string) => void;
  onPause: () => void;
  onReset: () => void;
  onRetry: () => void;
}

const EVENT_STYLES: Record<GameEvent['type'], { border: string; label: string; nameClass: string }> = {
  narration: { border: 'border-l-purple-400', label: 'GM', nameClass: 'text-purple-400' },
  action: { border: 'border-l-cyan-400', label: '', nameClass: 'text-cyan-400' },
  roll: { border: 'border-l-amber-400', label: '', nameClass: 'text-amber-400' },
  result: { border: 'border-l-purple-400', label: 'GM', nameClass: 'text-purple-400' },
  system: { border: 'border-l-slate-500', label: '系统', nameClass: 'text-slate-500' },
  user: { border: 'border-l-emerald-400', label: '玩家', nameClass: 'text-emerald-400' },
};

const ACTION_TYPES = [
  { id: 'attack', label: '攻击' },
  { id: 'defend', label: '防御' },
  { id: 'skill', label: '技能' },
  { id: 'talk', label: '交涉' },
  { id: 'custom', label: '自定义' },
];

export default function GameBoard({
  gameState,
  currentTurnCharId,
  isGenerating,
  thinkingName,
  lastRoll,
  error,
  isPaused,
  userActionNeeded,
  onUserAction,
  onPause,
  onReset,
  onRetry,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState.log, thinkingName]);

  const handleSubmitAction = (actionType: string) => {
    const desc = inputRef.current?.value?.trim() ?? '';
    if (!desc) return;
    onUserAction(actionType, desc);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitAction('custom');
    }
  };

  const activeChar = currentTurnCharId
    ? gameState.characters.find((c) => c.id === currentTurnCharId)
    : null;

  return (
    <div class="border border-slate-700 rounded-xl bg-surface-800 overflow-hidden">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-surface-900/50">
        <div class="flex items-center gap-3">
          <span class="text-sm font-medium text-slate-200">第 {gameState.round} 轮</span>
          <span class="text-xs text-slate-500">
            {gameState.phase === 'gm-narration' && 'GM叙述中'}
            {gameState.phase === 'player-actions' && (activeChar ? `${activeChar.name}的回合` : '行动阶段')}
            {gameState.phase === 'resolution' && '结算中'}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            onClick={onPause}
            class="text-xs px-3 py-1.5 rounded-lg bg-surface-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isPaused ? '继续' : '暂停'}
          </button>
          <button
            onClick={onReset}
            class="text-xs px-3 py-1.5 rounded-lg bg-surface-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            重新开始
          </button>
        </div>
      </div>

      <div class="flex">
        {/* Sidebar - Character Sheets */}
        <div class="w-48 shrink-0 border-r border-slate-700 p-3 space-y-2 overflow-y-auto max-h-[550px]">
          {gameState.characters.map((c) => (
            <CharacterSheet
              key={c.id}
              character={c}
              isActive={currentTurnCharId === c.id}
            />
          ))}
        </div>

        {/* Main Log */}
        <div class="flex-1 flex flex-col">
          <div class="flex-1 overflow-y-auto p-4 space-y-2 max-h-[500px]">
            {gameState.log.length === 0 && !thinkingName && (
              <div class="flex items-center justify-center h-full">
                <p class="text-slate-500 text-sm">游戏即将开始...</p>
              </div>
            )}

            {gameState.log.map((event, i) => {
              const style = EVENT_STYLES[event.type];
              return (
                <div key={i} class={`border-l-2 ${style.border} pl-3`}>
                  <div class={`text-xs font-medium ${style.nameClass} mb-0.5`}>
                    {event.type === 'action' ? event.speaker : style.label}
                  </div>
                  <div class="text-sm text-slate-200 whitespace-pre-wrap">{event.content}</div>
                  {event.roll && (
                    <div class="mt-1">
                      <span class="text-xs font-mono text-amber-400">{formatRoll(event.roll)}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {thinkingName && (
              <div class="border-l-2 border-l-purple-400 pl-3">
                <div class="text-xs font-medium text-purple-400 mb-0.5">{thinkingName}</div>
                <div class="text-sm text-slate-400 animate-pulse">{thinkingName} 正在思考...</div>
              </div>
            )}

            {lastRoll && (
              <div class="flex justify-center py-2">
                <DiceRoller roll={lastRoll} />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Error */}
          {error && (
            <div class="px-4 pb-2">
              <div class="text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg flex items-center justify-between">
                <span>{error}</span>
                <button onClick={onRetry} class="ml-2 text-red-300 underline hover:text-red-200">
                  重试
                </button>
              </div>
            </div>
          )}

          {/* Action Input (when user's turn) */}
          {userActionNeeded && (
            <div class="border-t border-slate-700 p-3">
              <div class="text-xs text-accent-400 mb-2">轮到你行动了！选择行动类型并描述：</div>
              <div class="flex gap-1.5 mb-2">
                {ACTION_TYPES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSubmitAction(a.id)}
                    class="px-2.5 py-1 text-xs rounded-lg bg-surface-700 text-slate-400 hover:text-accent-400 hover:bg-surface-900 transition-colors"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <div class="flex gap-2">
                <textarea
                  ref={inputRef}
                  onKeyDown={handleKeyDown}
                  placeholder="描述你的行动..."
                  rows={1}
                  class="flex-1 px-3 py-2 bg-surface-900 border border-slate-700 rounded-lg text-sm text-slate-200 resize-none focus:outline-none focus:border-accent-500 placeholder:text-slate-600"
                />
                <button
                  onClick={() => handleSubmitAction('custom')}
                  class="px-4 py-2 bg-accent-500 text-white rounded-lg text-sm font-medium hover:bg-accent-600 transition-colors"
                >
                  确认
                </button>
              </div>
            </div>
          )}

          {/* Status bar when not user's turn */}
          {!userActionNeeded && isGenerating && (
            <div class="border-t border-slate-700 px-4 py-2">
              <div class="text-xs text-slate-500 animate-pulse">
                {thinkingName ? `${thinkingName} 正在行动...` : '处理中...'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
