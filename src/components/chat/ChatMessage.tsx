interface Props {
  role: 'user' | 'assistant';
  content: string;
  characterName?: string;
}

export default function ChatMessage({ role, content, characterName }: Props) {
  const isUser = role === 'user';
  return (
    <div class={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        class={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-accent-500 text-white rounded-br-sm'
            : 'bg-surface-700 text-slate-200 rounded-bl-sm'
        }`}
      >
        {!isUser && characterName && (
          <div class="text-xs font-medium text-accent-400 mb-1">{characterName}</div>
        )}
        <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
      </div>
    </div>
  );
}
