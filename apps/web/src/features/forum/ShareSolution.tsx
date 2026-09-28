import type { ForumDraft, Message, Task } from '@app/shared';
import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { toChat } from '@/features/agent/agent';
import { useBoard } from '@/features/board/store';
import { forumApi } from '@/lib/api';
import { NewThreadDialog } from './NewThreadDialog';

/** Черновик без ИИ: суть обращения и то, что помогло (шаги, ответы специалиста, инструкции). */
function localDraft(task: Task, messages: Message[]): ForumDraft {
  const problem =
    task.triage?.summary || messages.find((m) => m.role === 'user')?.content || task.title;
  const helped = [
    ...messages.filter((m) => m.stepReport?.ok).map((m) => m.stepReport!.title),
    ...messages.filter((m) => m.kind === 'specialist').map((m) => m.content.replace(/\s+/g, ' ')),
  ];
  return {
    sectionId: 'other',
    title: task.title,
    body: `**Проблема:** ${problem}\n\n**Что помогло:**\n${
      helped.length ? helped.map((h, i) => `${i + 1}. ${h}`).join('\n') : '1. …'
    }`,
  };
}

/**
 * «Поделиться решением на БатФоруме»: из решённого обращения — черновик темы.
 * ИИ убирает личные данные; человек проверяет и правит перед публикацией.
 */
export function ShareSolution({ task, messages }: { task: Task; messages: Message[] }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ForumDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const d = await forumApi.draft(toChat(messages), useBoard.getState().settings.model);
      setDraft(d.title && d.body ? d : localDraft(task, messages));
    } catch {
      setDraft(localDraft(task, messages)); // ИИ недоступен — черновик из переписки
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<Share2 size={16} />}
          disabled={busy}
          onClick={() => void start()}
        >
          {busy ? 'Готовлю черновик…' : 'Поделиться решением на БатФоруме'}
        </Button>
        <span className="text-sm text-fg-muted">коллегам с такой же проблемой</span>
      </div>
      <NewThreadDialog
        open={draft !== null}
        draft={draft}
        fromRequest
        title="Поделиться решением"
        description="Черновик собран из обращения. Проверьте, что в нём нет имён, телефонов и других личных данных, и поправьте, если нужно."
        onClose={() => setDraft(null)}
        onCreated={(id) => {
          setDraft(null);
          navigate(`/forum/t/${id}`);
        }}
      />
    </>
  );
}
