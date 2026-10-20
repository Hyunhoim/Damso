import { isParentLabel, type ParentLabel } from './family.ts';
import type { Role } from './stories.ts';

export const summaryStyles = [
  { id: 'auto', title: '내 말투 살리기', ending: '기본 · 원문의 말투 유지', description: '녹음된 평소 말투와 비슷하게 요약해요', example: '첫 월급으로 어머니께 내복을 사드렸어. 어머니가 좋아하시더라.' },
  { id: 'diary', title: '담백한 일기', ending: '…했다 · …였다', description: '하루를 짧게 돌아보는 일기처럼', example: '첫 월급으로 어머니께 내복을 사드렸다. 어머니가 선물을 좋아하셨다.' },
] as const;
export type SummaryStyle = typeof summaryStyles[number]['id'];
export const preferencesStorageKey = 'damso:preview:onboarding:v2';
export type Preferences = { role: Role; parentLabel: ParentLabel; summaryStyle: SummaryStyle; completed: boolean };
export function isSummaryStyle(value: unknown): value is SummaryStyle {
  return summaryStyles.some(style => style.id === value);
}
export function parsePreferences(raw: string | null): Preferences | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (value && ['conversational', 'formal'].includes(value.summaryStyle)) value.summaryStyle = 'auto';
    if (value && ['parent', 'child'].includes(value.role) && isParentLabel(value.parentLabel) && isSummaryStyle(value.summaryStyle) && typeof value.completed === 'boolean') return value;
  } catch { /* A damaged local preference must not block setup. */ }
  return null;
}

export const legacyPreferencesStorageKey = 'damso:preview:onboarding:v1';
export function migratePreferences(raw: string | null, legacy: string | null): Preferences | null {
  const current = parsePreferences(raw);
  if (current) return current;
  const previous = parsePreferences(legacy);
  return previous ? { ...previous, summaryStyle: 'auto' } : null;
}
