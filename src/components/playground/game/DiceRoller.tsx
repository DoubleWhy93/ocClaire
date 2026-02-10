import { useState, useEffect } from 'preact/hooks';
import type { DiceRoll } from './gameState';

interface Props {
  roll: DiceRoll | null;
}

export default function DiceRoller({ roll }: Props) {
  const [animating, setAnimating] = useState(false);
  const [displayValue, setDisplayValue] = useState<number | null>(null);

  useEffect(() => {
    if (!roll) return;
    setAnimating(true);
    let frame = 0;
    const maxFrames = 8;
    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 20) + 1);
      frame++;
      if (frame >= maxFrames) {
        clearInterval(interval);
        setDisplayValue(roll.value);
        setAnimating(false);
      }
    }, 60);
    return () => clearInterval(interval);
  }, [roll]);

  if (!roll) return null;

  const modStr = roll.modifier >= 0 ? `+${roll.modifier}` : `${roll.modifier}`;
  const successClass = roll.success === true
    ? 'text-emerald-400'
    : roll.success === false
      ? 'text-red-400'
      : 'text-slate-300';

  return (
    <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-surface-900 border border-slate-700 rounded-lg text-sm">
      <span class="text-slate-500">d20</span>
      <span class={`font-mono font-bold text-lg ${animating ? 'text-amber-400 animate-pulse' : 'text-amber-300'}`}>
        {displayValue ?? roll.value}
      </span>
      <span class="text-slate-500">{modStr}</span>
      <span class="text-slate-500">=</span>
      <span class={`font-bold ${successClass}`}>{roll.total}</span>
      {roll.dc !== undefined && (
        <>
          <span class="text-slate-600">vs DC{roll.dc}</span>
          <span class={`text-xs font-medium ${successClass}`}>
            {roll.success ? '成功' : '失败'}
          </span>
        </>
      )}
    </div>
  );
}
