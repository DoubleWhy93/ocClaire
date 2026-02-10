import { useEffect, useRef } from 'preact/hooks';

export interface ConversationMessage {
  speaker: string;
  content: string;
  isUser?: boolean;
}

interface Props {
  messages: ConversationMessage[];
  thinkingName?: string | null;
  characterColors: Record<string, string>;
}

const BORDER_COLORS: Record<string, string> = {
  indigo: 'border-l-indigo-400',
  emerald: 'border-l-emerald-400',
  amber: 'border-l-amber-400',
  rose: 'border-l-rose-400',
  cyan: 'border-l-cyan-400',
};

const NAME_COLORS: Record<string, string> = {
  indigo: 'text-indigo-400',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
  cyan: 'text-cyan-400',
};

export default function ConversationView({ messages, thinkingName, characterColors }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingName]);

  return (
    <div class="h-[500px] overflow-y-auto p-4 space-y-3">
      {messages.length === 0 && !thinkingName && (
        <div class="flex items-center justify-center h-full">
          <p class="text-slate-500 text-sm">对话即将开始...</p>
        </div>
      )}

      {messages.map((msg, i) => {
        const colorKey = msg.isUser ? null : characterColors[msg.speaker];
        const borderClass = colorKey ? BORDER_COLORS[colorKey] : 'border-l-slate-500';
        const nameClass = colorKey ? NAME_COLORS[colorKey] : 'text-slate-400';

        return (
          <div key={i} class={`border-l-2 ${borderClass} pl-3`}>
            <div class={`text-xs font-medium ${nameClass} mb-0.5`}>
              {msg.isUser ? '你' : msg.speaker}
            </div>
            <div class="text-sm text-slate-200 whitespace-pre-wrap">{msg.content}</div>
          </div>
        );
      })}

      {thinkingName && (
        <div class={`border-l-2 ${BORDER_COLORS[characterColors[thinkingName]] || 'border-l-slate-500'} pl-3`}>
          <div class={`text-xs font-medium ${NAME_COLORS[characterColors[thinkingName]] || 'text-slate-400'} mb-0.5`}>
            {thinkingName}
          </div>
          <div class="text-sm text-slate-400 animate-pulse">{thinkingName} 正在思考...</div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
