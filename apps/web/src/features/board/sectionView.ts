import { GENERAL_SECTION_ID } from '@app/shared';
import { createContext, useContext } from 'react';

/** Раздел, доска которого открыта: карточки показывают метки других разделов и «Убрать из раздела». */
export const SectionView = createContext<string>(GENERAL_SECTION_ID);

export const useSectionView = () => useContext(SectionView);
