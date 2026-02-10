export interface CharacterGameState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  stats: { str: number; agi: number; int: number; cha: number; wil: number };
  conditions: string[];
  eliminated: boolean;
  isUserControlled: boolean;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface GameState {
  phase: 'gm-narration' | 'player-actions' | 'resolution';
  round: number;
  scene: string;
  characters: CharacterGameState[];
  log: GameEvent[];
  turnQueue: string[];
}

export interface GameEvent {
  type: 'narration' | 'action' | 'roll' | 'result' | 'system' | 'user';
  speaker: string;
  content: string;
  roll?: DiceRoll;
}

export interface DiceRoll {
  dice: string;
  value: number;
  modifier: number;
  total: number;
  dc?: number;
  success?: boolean;
}

const TRAIT_STAT_MAP: Record<string, Partial<Record<keyof CharacterGameState['stats'], number>>> = {
  '剑道至上': { str: 2, agi: 1 },
  '极端克制': { wil: 2, cha: -1 },
  '寡言直率': { cha: -1, wil: 1 },
  '感情极端': { wil: -1, str: 1 },
  '洒脱自在': { cha: 2, wil: 1 },
  '古道热肠': { cha: 1, wil: 1 },
  '冷静分析': { int: 2, agi: 1 },
  '机敏灵活': { agi: 2, int: 1 },
  '神秘莫测': { int: 1, cha: 1 },
  '狡诈多变': { int: 2, cha: 1 },
  '温柔体贴': { cha: 2, wil: 1 },
  '暴力倾向': { str: 2, wil: -1 },
  '坚韧不拔': { wil: 2, str: 1 },
  '领袖气质': { cha: 2, str: 1 },
};

export function deriveStats(traits: string[]): CharacterGameState['stats'] {
  const stats = { str: 10, agi: 10, int: 10, cha: 10, wil: 10 };
  for (const trait of traits) {
    const mods = TRAIT_STAT_MAP[trait];
    if (mods) {
      for (const [key, val] of Object.entries(mods)) {
        stats[key as keyof typeof stats] += val;
      }
    }
  }
  return stats;
}

export function computeMaxHp(wil: number): number {
  return 20 + wil * 2;
}

export function buildTurnQueue(characters: CharacterGameState[]): string[] {
  return characters.filter((c) => !c.eliminated).map((c) => c.id);
}

export function applyDamage(state: GameState, charId: string, damage: number): GameState {
  const characters = state.characters.map((c) => {
    if (c.id !== charId) return c;
    const newHp = Math.max(0, c.hp - damage);
    const eliminated = newHp <= 0;
    return { ...c, hp: newHp, eliminated };
  });
  return {
    ...state,
    characters,
    turnQueue: buildTurnQueue(characters),
  };
}

export function applyHealing(state: GameState, charId: string, amount: number): GameState {
  const characters = state.characters.map((c) => {
    if (c.id !== charId) return c;
    return { ...c, hp: Math.min(c.maxHp, c.hp + amount) };
  });
  return { ...state, characters };
}

export function addCondition(state: GameState, charId: string, condition: string): GameState {
  const characters = state.characters.map((c) => {
    if (c.id !== charId || c.conditions.includes(condition)) return c;
    return { ...c, conditions: [...c.conditions, condition] };
  });
  return { ...state, characters };
}

export function removeCondition(state: GameState, charId: string, condition: string): GameState {
  const characters = state.characters.map((c) => {
    if (c.id !== charId) return c;
    return { ...c, conditions: c.conditions.filter((x) => x !== condition) };
  });
  return { ...state, characters };
}

export function rollDice(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollD20WithMod(modifier: number, dc?: number): DiceRoll {
  const value = rollDice(20);
  const total = value + modifier;
  return {
    dice: 'd20',
    value,
    modifier,
    total,
    dc,
    success: dc !== undefined ? total >= dc : undefined,
  };
}

export function getStatModifier(statValue: number): number {
  return Math.floor((statValue - 10) / 2);
}

export function formatRoll(roll: DiceRoll): string {
  const modStr = roll.modifier >= 0 ? `+${roll.modifier}` : `${roll.modifier}`;
  let text = `d20(${roll.value})${modStr}=${roll.total}`;
  if (roll.dc !== undefined) {
    text += ` vs DC${roll.dc} ${roll.success ? '成功' : '失败'}`;
  }
  return text;
}
