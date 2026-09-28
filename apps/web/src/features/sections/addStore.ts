import { create } from 'zustand';

/** Какой раздел пополняем в окне «Добавить обращения» (открывается из меню, шапки и пустого раздела). */
export const useAddToSection = create<{
  sectionId: string | null;
  open: (sectionId: string) => void;
  close: () => void;
}>()((set) => ({
  sectionId: null,
  open: (sectionId) => set({ sectionId }),
  close: () => set({ sectionId: null }),
}));
