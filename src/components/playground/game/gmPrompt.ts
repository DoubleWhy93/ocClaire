import type { CharacterGameState, GameEvent } from './gameState';
import { getStatModifier } from './gameState';

export function buildGmSystemPrompt(
  gameRulesContent: string,
  scene: string,
  characters: CharacterGameState[],
  round: number,
): string {
  const charSummaries = characters.map((c) => {
    const status = c.eliminated ? '【已淘汰】' : `HP: ${c.hp}/${c.maxHp}`;
    const conditions = c.conditions.length > 0 ? ` 状态: ${c.conditions.join(', ')}` : '';
    const stats = `STR:${c.stats.str}(${formatMod(c.stats.str)}) AGI:${c.stats.agi}(${formatMod(c.stats.agi)}) INT:${c.stats.int}(${formatMod(c.stats.int)}) CHA:${c.stats.cha}(${formatMod(c.stats.cha)}) WIL:${c.stats.wil}(${formatMod(c.stats.wil)})`;
    return `- ${c.name}: ${status}${conditions} | ${stats}`;
  }).join('\n');

  return `${gameRulesContent}

【当前场景】
${scene}

【第${round}轮】

【角色状态】
${charSummaries}`;
}

function formatMod(stat: number): string {
  const mod = getStatModifier(stat);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function buildGmNarrationMessages(
  systemPrompt: string,
  recentLog: GameEvent[],
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (recentLog.length === 0) {
    messages.push({ role: 'user', content: '游戏开始。请描述开场场景，为角色们设定初始情境。' });
  } else {
    const logText = formatLogForGm(recentLog);
    messages.push({ role: 'user', content: `以下是最近发生的事件：\n${logText}\n\n请描述当前场景的最新发展。` });
  }

  return messages;
}

export function buildGmResolutionMessages(
  systemPrompt: string,
  actions: { charName: string; action: string; roll: string }[],
  recentLog: GameEvent[],
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const actionsText = actions.map((a) =>
    `${a.charName}: ${a.action} | 骰子: ${a.roll}`
  ).join('\n');

  const logText = recentLog.length > 0 ? `\n\n最近事件：\n${formatLogForGm(recentLog.slice(-10))}` : '';

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `本轮所有角色的行动和骰子结果如下：\n${actionsText}${logText}\n\n请裁定结果并叙述发生了什么。如有HP变动或状态变化，请在末尾标注。`,
    },
  ];
}

export function buildCharacterActionPrompt(
  originalSystemPrompt: string,
  scene: string,
  charName: string,
  recentLog: GameEvent[],
): string {
  const logText = recentLog.length > 0
    ? `\n\n【最近发生的事】\n${formatLogForGm(recentLog.slice(-8))}`
    : '';

  return `${originalSystemPrompt}

【游戏模式】
你正在参与一个桌游RPG。当前场景：${scene}${logText}

根据当前局势和你的性格，宣布你想要采取的行动。
回复格式：简短描述你的行动（1-2句话），以动作开头。例如："举剑向敌人发起攻击。" 或 "尝试说服对方放下武器。"`;
}

function formatLogForGm(log: GameEvent[]): string {
  return log.map((e) => {
    switch (e.type) {
      case 'narration': return `[GM]: ${e.content}`;
      case 'action': return `[${e.speaker}的行动]: ${e.content}`;
      case 'roll': return `[骰子] ${e.content}`;
      case 'result': return `[结果]: ${e.content}`;
      case 'system': return `[系统]: ${e.content}`;
      case 'user': return `[玩家]: ${e.content}`;
      default: return e.content;
    }
  }).join('\n');
}

export function parseHpChanges(text: string): { name: string; delta: number }[] {
  const changes: { name: string; delta: number }[] = [];
  const regex = /\[HP变动:\s*(.+?)\s+([+-]\d+)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    changes.push({ name: match[1], delta: parseInt(match[2], 10) });
  }
  return changes;
}

export function parseConditionChanges(text: string): { name: string; condition: string; add: boolean }[] {
  const changes: { name: string; condition: string; add: boolean }[] = [];
  const regex = /\[状态:\s*(.+?)\s+([+-])(.+?)\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    changes.push({ name: match[1], condition: match[3], add: match[2] === '+' });
  }
  return changes;
}
