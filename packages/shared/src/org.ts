/**
 * Профиль организации (ТЗ v4.12, п. 17, шаг 1): роль и характер помощника и «тонкости».
 * Копия типов из apps/api/src/org/profile.ts — держать в синхроне.
 */
export type OrgTemplateId = 'it' | 'gov' | 'games' | 'shop' | 'custom';
export type OrgAddress = 'vy' | 'ty';
export type OrgTone = 'friendly' | 'business' | 'brief';
export type OrgOffTopic = 'answer' | 'decline';

export interface OrgProfile {
  template: OrgTemplateId;
  orgName: string;
  assistantName: string;
  role: string;
  scope: string;
  address: OrgAddress;
  tone: OrgTone;
  offTopic: OrgOffTopic;
  always: string[];
  never: string[];
  signature: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface OrgTemplate {
  id: OrgTemplateId;
  title: string;
  description: string;
  profile: OrgProfile;
}

export interface OrgInfo {
  configured: boolean;
  orgName: string;
  assistantName: string;
}

export interface OrgLimits {
  orgName: number;
  assistantName: number;
  role: number;
  scope: number;
  rule: number;
  rules: number;
  signature: number;
}

/** GET /api/org: администратору — профиль, шаблоны и пределы; остальным — только info. */
export interface OrgState {
  info: OrgInfo;
  profile?: OrgProfile | null;
  templates?: OrgTemplate[];
  limits?: OrgLimits;
}
