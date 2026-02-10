import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { ChatConfig } from '../../chat/chatApi';
import { sendMessage } from '../../chat/chatApi';
import GameSetup from './GameSetup';
import type { GameSetupResult, GameCharacterInfo } from './GameSetup';
import GameBoard from './GameBoard';
import type { GameState, CharacterGameState, GameEvent, DiceRoll } from './gameState';
import {
  deriveStats, computeMaxHp, buildTurnQueue,
  rollD20WithMod, getStatModifier, formatRoll,
} from './gameState';
import {
  buildGmSystemPrompt, buildGmNarrationMessages,
  buildGmResolutionMessages, buildCharacterActionPrompt,
  parseHpChanges, parseConditionChanges,
} from './gmPrompt';

interface Props {
  characters: GameCharacterInfo[];
  gameRulesContent: string;
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

function resolveModel(baseModel: string, provider: 'openai' | 'anthropic'): string {
  if (provider === 'anthropic' && baseModel.startsWith('gpt-')) return 'claude-sonnet-4-5-20250929';
  if (provider === 'openai' && baseModel.startsWith('claude-')) return 'gpt-4o-mini';
  return baseModel;
}

function actionTypeToStat(actionType: string): keyof CharacterGameState['stats'] {
  switch (actionType) {
    case 'attack': return 'str';
    case 'defend': return 'agi';
    case 'skill': return 'int';
    case 'talk': return 'cha';
    default: return 'str';
  }
}

function actionTypeToDC(actionType: string): number {
  switch (actionType) {
    case 'attack': return 12;
    case 'defend': return 10;
    case 'skill': return 14;
    case 'talk': return 13;
    default: return 12;
  }
}

export default function GameWidget({ characters, gameRulesContent }: Props) {
  const [mode, setMode] = useState<'setup' | 'playing'>('setup');
  const [config, setConfig] = useState<Partial<ChatConfig>>({});
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [thinkingName, setThinkingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [lastRoll, setLastRoll] = useState<DiceRoll | null>(null);
  const [userActionNeeded, setUserActionNeeded] = useState(false);
  const [currentTurnCharId, setCurrentTurnCharId] = useState<string | null>(null);

  // Refs to track latest state in async callbacks
  const gameStateRef = useRef<GameState | null>(null);
  const actionQueueRef = useRef<{ charName: string; action: string; roll: string; rollData: DiceRoll }[]>([]);

  useEffect(() => {
    setConfig(getStoredConfig());
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const handleSaveKey = (provider: 'openai' | 'anthropic', apiKey: string) => {
    storeConfig(provider, apiKey);
    setConfig({ provider, apiKey });
  };

  const buildCharGameState = (
    char: GameCharacterInfo,
    isUserControlled: boolean,
  ): CharacterGameState => {
    const stats = deriveStats(char.traits);
    const maxHp = computeMaxHp(stats.wil);
    return {
      id: char.id,
      name: char.name,
      hp: maxHp,
      maxHp,
      stats,
      conditions: [],
      eliminated: false,
      isUserControlled,
      systemPrompt: char.systemPrompt,
      model: char.model,
      temperature: char.temperature,
      maxTokens: char.maxTokens,
    };
  };

  const callApi = async (
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    model: string,
    temperature: number,
    maxTokens: number,
    onChunk?: (text: string) => void,
  ): Promise<string> => {
    const cfg = config as ChatConfig;
    return sendMessage(messages, {
      ...cfg,
      model: resolveModel(model, cfg.provider),
      temperature,
      maxTokens,
    }, onChunk);
  };

  const addLogEvent = useCallback((event: GameEvent) => {
    setGameState((prev) => {
      if (!prev) return prev;
      return { ...prev, log: [...prev.log, event] };
    });
  }, []);

  const runGmNarration = useCallback(async (state: GameState, cfg: ChatConfig) => {
    setThinkingName('GM');
    setIsGenerating(true);

    try {
      const gmSystem = buildGmSystemPrompt(gameRulesContent, state.scene, state.characters, state.round);
      const messages = buildGmNarrationMessages(gmSystem, state.log.slice(-15));

      let narration = '';
      const result = await callApi(
        messages,
        'gpt-4o-mini',
        0.9,
        2048,
        (partial) => { narration = partial; },
      );
      narration = result;

      const event: GameEvent = { type: 'narration', speaker: 'GM', content: narration };
      const newState: GameState = {
        ...state,
        phase: 'player-actions',
        log: [...state.log, event],
      };
      setGameState(newState);
      setThinkingName(null);
      setIsGenerating(false);

      // Start player action phase
      await runPlayerActions(newState, cfg);
    } catch (err: any) {
      setError(err.message || 'GM叙述请求失败');
      setThinkingName(null);
      setIsGenerating(false);
    }
  }, [config, gameRulesContent]);

  const runPlayerActions = useCallback(async (state: GameState, cfg: ChatConfig) => {
    actionQueueRef.current = [];
    const queue = state.turnQueue;

    for (let i = 0; i < queue.length; i++) {
      if (isPausedRef.current) {
        setIsPaused(true);
        return;
      }

      const charId = queue[i];
      const char = state.characters.find((c) => c.id === charId);
      if (!char || char.eliminated) continue;

      setCurrentTurnCharId(charId);

      if (char.isUserControlled) {
        // Wait for user input
        setUserActionNeeded(true);
        return; // Will resume from handleUserAction
      }

      // AI-controlled character
      setThinkingName(char.name);
      setIsGenerating(true);

      try {
        const actionPrompt = buildCharacterActionPrompt(
          char.systemPrompt, state.scene, char.name, state.log.slice(-10),
        );
        const messages = [
          { role: 'system' as const, content: actionPrompt },
          { role: 'user' as const, content: '现在轮到你行动了。请宣布你的行动。' },
        ];

        const action = await callApi(messages, char.model, char.temperature, 512);

        // Determine action type heuristic
        const stat: keyof CharacterGameState['stats'] = action.includes('攻击') || action.includes('斩') || action.includes('劈')
          ? 'str'
          : action.includes('躲') || action.includes('闪') || action.includes('防')
            ? 'agi'
            : action.includes('说服') || action.includes('交涉') || action.includes('谈')
              ? 'cha'
              : action.includes('分析') || action.includes('观察') || action.includes('思考')
                ? 'int'
                : 'str';

        const mod = getStatModifier(char.stats[stat]);
        const dc = stat === 'agi' ? 10 : stat === 'cha' ? 13 : stat === 'int' ? 14 : 12;
        const roll = rollD20WithMod(mod, dc);

        setLastRoll(roll);

        const actionEvent: GameEvent = { type: 'action', speaker: char.name, content: action };
        const rollEvent: GameEvent = {
          type: 'roll',
          speaker: char.name,
          content: `${char.name} ${formatRoll(roll)}`,
          roll,
        };

        actionQueueRef.current.push({
          charName: char.name,
          action,
          roll: formatRoll(roll),
          rollData: roll,
        });

        state = {
          ...state,
          log: [...state.log, actionEvent, rollEvent],
        };
        setGameState(state);
        setThinkingName(null);
        setIsGenerating(false);

        // Brief pause between characters
        await new Promise((r) => setTimeout(r, 500));
      } catch (err: any) {
        setError(err.message || `${char.name}行动请求失败`);
        setThinkingName(null);
        setIsGenerating(false);
        return;
      }
    }

    // All actions collected, run resolution
    setLastRoll(null);
    await runResolution(state, cfg);
  }, [config, gameRulesContent]);

  const handleUserAction = useCallback((actionType: string, description: string) => {
    setUserActionNeeded(false);
    const state = gameStateRef.current;
    if (!state) return;

    const charId = currentTurnCharId;
    const char = state.characters.find((c) => c.id === charId);
    if (!char) return;

    const stat = actionTypeToStat(actionType);
    const mod = getStatModifier(char.stats[stat]);
    const dc = actionTypeToDC(actionType);
    const roll = rollD20WithMod(mod, dc);

    setLastRoll(roll);

    const actionEvent: GameEvent = { type: 'action', speaker: char.name, content: description };
    const rollEvent: GameEvent = {
      type: 'roll',
      speaker: char.name,
      content: `${char.name} ${formatRoll(roll)}`,
      roll,
    };

    actionQueueRef.current.push({
      charName: char.name,
      action: description,
      roll: formatRoll(roll),
      rollData: roll,
    });

    const newState: GameState = {
      ...state,
      log: [...state.log, actionEvent, rollEvent],
    };
    setGameState(newState);

    // Continue with remaining characters
    const queue = state.turnQueue;
    const currentIdx = queue.indexOf(charId!);
    const remainingQueue = queue.slice(currentIdx + 1);

    if (remainingQueue.length === 0) {
      // All done, run resolution
      setLastRoll(null);
      runResolution(newState, config as ChatConfig);
    } else {
      // Continue AI turns
      const continuedState = { ...newState, turnQueue: remainingQueue };
      setTimeout(() => runPlayerActionsFrom(continuedState, config as ChatConfig, remainingQueue), 300);
    }
  }, [currentTurnCharId, config, gameRulesContent]);

  const runPlayerActionsFrom = useCallback(async (state: GameState, cfg: ChatConfig, queue: string[]) => {
    for (let i = 0; i < queue.length; i++) {
      if (isPausedRef.current) return;

      const charId = queue[i];
      const char = state.characters.find((c) => c.id === charId);
      if (!char || char.eliminated) continue;

      setCurrentTurnCharId(charId);

      if (char.isUserControlled) {
        setUserActionNeeded(true);
        return;
      }

      setThinkingName(char.name);
      setIsGenerating(true);

      try {
        const actionPrompt = buildCharacterActionPrompt(
          char.systemPrompt, state.scene, char.name, state.log.slice(-10),
        );
        const messages = [
          { role: 'system' as const, content: actionPrompt },
          { role: 'user' as const, content: '现在轮到你行动了。请宣布你的行动。' },
        ];

        const action = await callApi(messages, char.model, char.temperature, 512);

        const stat: keyof CharacterGameState['stats'] = action.includes('攻击') || action.includes('斩')
          ? 'str'
          : action.includes('躲') || action.includes('闪')
            ? 'agi'
            : action.includes('说服') || action.includes('谈')
              ? 'cha'
              : 'str';

        const mod = getStatModifier(char.stats[stat]);
        const dc = stat === 'agi' ? 10 : stat === 'cha' ? 13 : 12;
        const roll = rollD20WithMod(mod, dc);
        setLastRoll(roll);

        const actionEvent: GameEvent = { type: 'action', speaker: char.name, content: action };
        const rollEvent: GameEvent = {
          type: 'roll',
          speaker: char.name,
          content: `${char.name} ${formatRoll(roll)}`,
          roll,
        };

        actionQueueRef.current.push({
          charName: char.name,
          action,
          roll: formatRoll(roll),
          rollData: roll,
        });

        state = { ...state, log: [...state.log, actionEvent, rollEvent] };
        setGameState(state);
        setThinkingName(null);
        setIsGenerating(false);

        await new Promise((r) => setTimeout(r, 500));
      } catch (err: any) {
        setError(err.message || `${char.name}行动请求失败`);
        setThinkingName(null);
        setIsGenerating(false);
        return;
      }
    }

    setLastRoll(null);
    await runResolution(state, cfg);
  }, [config, gameRulesContent]);

  const runResolution = useCallback(async (state: GameState, cfg: ChatConfig) => {
    setThinkingName('GM');
    setIsGenerating(true);

    const newState: GameState = { ...state, phase: 'resolution' };
    setGameState(newState);

    try {
      const gmSystem = buildGmSystemPrompt(gameRulesContent, state.scene, state.characters, state.round);
      const messages = buildGmResolutionMessages(gmSystem, actionQueueRef.current, state.log.slice(-15));

      let resolution = '';
      const result = await callApi(messages, 'gpt-4o-mini', 0.9, 2048, (partial) => { resolution = partial; });
      resolution = result;

      // Parse HP/condition changes from GM response
      const hpChanges = parseHpChanges(resolution);
      const condChanges = parseConditionChanges(resolution);

      let updatedChars = [...state.characters];

      for (const { name, delta } of hpChanges) {
        updatedChars = updatedChars.map((c) => {
          if (c.name !== name) return c;
          const newHp = Math.max(0, Math.min(c.maxHp, c.hp + delta));
          const eliminated = newHp <= 0;
          return { ...c, hp: newHp, eliminated };
        });
      }

      for (const { name, condition, add } of condChanges) {
        updatedChars = updatedChars.map((c) => {
          if (c.name !== name) return c;
          if (add && !c.conditions.includes(condition)) {
            return { ...c, conditions: [...c.conditions, condition] };
          }
          if (!add) {
            return { ...c, conditions: c.conditions.filter((x) => x !== condition) };
          }
          return c;
        });
      }

      // Check for eliminations
      const eliminationEvents: GameEvent[] = [];
      for (const c of updatedChars) {
        const prev = state.characters.find((p) => p.id === c.id);
        if (c.eliminated && prev && !prev.eliminated) {
          eliminationEvents.push({
            type: 'system',
            speaker: '系统',
            content: `${c.name} 已被淘汰！`,
          });
        }
      }

      const resolutionEvent: GameEvent = { type: 'result', speaker: 'GM', content: resolution };

      const finalState: GameState = {
        phase: 'gm-narration',
        round: state.round + 1,
        scene: state.scene,
        characters: updatedChars,
        log: [...state.log, resolutionEvent, ...eliminationEvents],
        turnQueue: buildTurnQueue(updatedChars),
      };
      setGameState(finalState);
      setThinkingName(null);
      setIsGenerating(false);
      setCurrentTurnCharId(null);

      // Check if game should continue
      const alive = updatedChars.filter((c) => !c.eliminated);
      if (alive.length <= 1) {
        const winner = alive[0];
        addLogEvent({
          type: 'system',
          speaker: '系统',
          content: winner
            ? `游戏结束！${winner.name} 是最后的幸存者！`
            : '游戏结束！所有角色均已淘汰。',
        });
        return;
      }

      // Auto-advance to next round
      if (!isPausedRef.current) {
        setTimeout(() => {
          if (!isPausedRef.current) {
            runGmNarration(finalState, cfg);
          }
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message || 'GM结算请求失败');
      setThinkingName(null);
      setIsGenerating(false);
    }
  }, [config, gameRulesContent, addLogEvent]);

  const handleStart = (setup: GameSetupResult) => {
    const gameChars: CharacterGameState[] = [];

    for (const id of setup.selectedIds) {
      const char = characters.find((c) => c.id === id);
      if (!char) continue;
      gameChars.push(buildCharGameState(char, id === setup.userCharacterId));
    }

    if (setup.customCharacter) {
      const customStats = { str: 10, agi: 10, int: 10, cha: 10, wil: 10 };
      const maxHp = computeMaxHp(customStats.wil);
      gameChars.push({
        id: '__custom__',
        name: setup.customCharacter.name,
        hp: maxHp,
        maxHp,
        stats: customStats,
        conditions: [],
        eliminated: false,
        isUserControlled: true,
        systemPrompt: setup.customCharacter.description || '你是一个冒险者。',
        model: 'gpt-4o-mini',
        temperature: 0.8,
        maxTokens: 512,
      });
    }

    const initialState: GameState = {
      phase: 'gm-narration',
      round: 1,
      scene: setup.background,
      characters: gameChars,
      log: [],
      turnQueue: buildTurnQueue(gameChars),
    };

    setGameState(initialState);
    setMode('playing');
    setError(null);
    setIsPaused(false);
    isPausedRef.current = false;
    actionQueueRef.current = [];

    // Start first GM narration
    runGmNarration(initialState, config as ChatConfig);
  };

  const handlePause = () => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    isPausedRef.current = newPaused;

    if (!newPaused && !isGenerating && gameState) {
      runGmNarration(gameState, config as ChatConfig);
    }
  };

  const handleReset = () => {
    setMode('setup');
    setGameState(null);
    setIsGenerating(false);
    setThinkingName(null);
    setError(null);
    setIsPaused(false);
    isPausedRef.current = false;
    setUserActionNeeded(false);
    setCurrentTurnCharId(null);
    setLastRoll(null);
  };

  const handleRetry = () => {
    setError(null);
    if (gameState) {
      if (gameState.phase === 'gm-narration') {
        runGmNarration(gameState, config as ChatConfig);
      } else if (gameState.phase === 'resolution') {
        runResolution(gameState, config as ChatConfig);
      } else {
        runPlayerActions(gameState, config as ChatConfig);
      }
    }
  };

  if (mode === 'setup') {
    return (
      <GameSetup
        characters={characters}
        config={config}
        onStart={handleStart}
        onSaveKey={handleSaveKey}
      />
    );
  }

  if (!gameState) return null;

  return (
    <GameBoard
      gameState={gameState}
      currentTurnCharId={currentTurnCharId}
      isGenerating={isGenerating}
      thinkingName={thinkingName}
      lastRoll={lastRoll}
      error={error}
      isPaused={isPaused}
      userActionNeeded={userActionNeeded}
      onUserAction={handleUserAction}
      onPause={handlePause}
      onReset={handleReset}
      onRetry={handleRetry}
    />
  );
}
