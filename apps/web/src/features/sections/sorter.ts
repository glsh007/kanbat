import { isManualSection, type SectionRef, type SortItem, type Task } from '@app/shared';
import { useBoard, userSections } from '@/features/board/store';
import { api } from '@/lib/api';

/**
 * ИИ раскладывает задачи по разделам по смыслу (ТЗ v3.3, п. 5). Индивидуальные (ручные)
 * разделы не трогает (ТЗ v4.6).
 * Работает в фоне и только добавляет: разделы, из которых задачу убрали вручную, не трогает.
 */

const S = () => useBoard.getState();

const ref = (s: { id: string; name: string; description?: string }): SectionRef => ({
  id: s.id,
  name: s.name,
  description: s.description,
});

/** Что ИИ знает о задаче: название, суть разбора и исходное обращение. */
function itemFor(t: Task): SortItem {
  const first = S().messages[t.id]?.find((m) => m.role === 'user')?.content ?? '';
  const parts = [t.title, t.triage?.meaningful ? t.triage.summary : '', first];
  const text = [...new Set(parts.map((x) => x.trim()).filter(Boolean))].join('. ');
  return { id: t.id, text: text.slice(0, 500) };
}

/** Новая задача после разбора: в какие разделы она подходит. */
export async function sortTask(id: string): Promise<void> {
  const t = S().tasks[id];
  if (!t || t.triage?.meaningful === false) return;
  // в индивидуальные (ручные) разделы ИИ ничего не кладёт — их пополняет сам человек
  const sections = userSections(S().sections).filter(
    (s) => !isManualSection(s) && !t.hiddenFrom.includes(s.id) && !t.sections.includes(s.id),
  );
  if (!sections.length) return;
  try {
    const r = await api.sort(sections.map(ref), [itemFor(t)], S().settings.model);
    S().applySort(r.assign);
  } catch (e) {
    console.warn('Раскладка по разделам не удалась', e);
  }
}

/** Новый или изменённый раздел: какие из существующих задач в него подходят. */
export async function sortSection(sectionId: string): Promise<void> {
  const section = S().sections.find((s) => s.id === sectionId);
  if (!section || isManualSection(section) || S().sorting[sectionId]) return;
  const items = Object.values(S().tasks)
    .filter(
      (t) =>
        !t.sections.includes(sectionId) &&
        !t.hiddenFrom.includes(sectionId) &&
        t.triage?.meaningful !== false,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(itemFor);
  if (!items.length) return;
  S().setSorting(sectionId, true);
  try {
    const r = await api.sort([ref(section)], items, S().settings.model);
    S().applySort(r.assign);
  } catch (e) {
    console.warn('Раскладка по разделам не удалась', e);
  } finally {
    S().setSorting(sectionId, false);
  }
}
