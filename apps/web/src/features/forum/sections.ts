import type { CommunityProposal, ForumReviewCount, ForumSection } from '@app/shared';
import { useEffect } from 'react';
import { create } from 'zustand';
import { forumApi } from '@/lib/api';

/** Сообщества форума с количеством тем — загружаются один раз и обновляются после изменений. */
export const useForumSections = create<{
  sections: ForumSection[];
  /** Сотруднику — свои предложения сообществ; специалисту — ждущие решения. */
  proposals: CommunityProposal[];
  load: () => Promise<void>;
  loadProposals: () => Promise<void>;
}>()((set) => ({
  sections: [],
  proposals: [],
  load: async () => {
    try {
      set({ sections: await forumApi.sections() });
    } catch {
      /* нет связи — сообщества подтянутся при следующем открытии */
    }
  },
  loadProposals: async () => {
    try {
      set({ proposals: await forumApi.proposals() });
    } catch {
      /* не критично */
    }
  },
}));

/** Счётчик «На проверке» для специалиста: жалобы и предложения сообществ. */
export const useReviewCount = create<{
  count: ForumReviewCount;
  refresh: () => Promise<void>;
}>()((set) => ({
  count: { reports: 0, proposals: 0 },
  refresh: async () => {
    try {
      set({ count: await forumApi.reviewCount() });
    } catch {
      /* нет связи — обновим позже */
    }
  },
}));

/** Опрос счётчика «На проверке» (раз в 20 с, в фоне — раз в минуту). */
export function useReviewPolling(enabled: boolean) {
  const refresh = useReviewCount((s) => s.refresh);
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const loop = async () => {
      await refresh();
      timer = window.setTimeout(
        () => void loop(),
        document.visibilityState === 'visible' ? 20_000 : 60_000,
      );
    };
    void loop();
    return () => window.clearTimeout(timer);
  }, [enabled, refresh]);
}

/** Короткое сообщение внизу экрана форума: «Жалоба отправлена», «Тема перенесена». */
export const useForumFlash = create<{
  text: string | null;
  show: (text: string) => void;
}>()((set) => {
  let timer: number | undefined;
  return {
    text: null,
    show: (text) => {
      window.clearTimeout(timer);
      set({ text });
      timer = window.setTimeout(() => set({ text: null }), 4000);
    },
  };
});

/** Название форума. */
export const FORUM_NAME = 'Бат-Форум';

/** Адрес сообщества в стиле Reddit: «б/почта». */
export const handle = (s: Pick<ForumSection, 'slug'>) => `б/${s.slug}`;

export const sectionName = (sections: ForumSection[], id: string) =>
  sections.find((s) => s.id === id)?.name ?? 'Раздел';

/** Адрес из названия — как на сервере: «Сеть и VPN» → «сеть-и-vpn». */
export function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^б\//, '')
    .replace(/ё/g, 'е')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-zа-я0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}
