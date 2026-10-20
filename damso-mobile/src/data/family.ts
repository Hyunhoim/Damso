import { names, type Role } from './stories.ts';

export const parentLabels = ['어머니', '아버지', '엄마', '아빠', '부모님'] as const;
export type ParentLabel = typeof parentLabels[number];
export const parentLabelStorageKey = 'damso:preview:family:parent-label:v1';

export function isParentLabel(value: unknown): value is ParentLabel {
  return parentLabels.some(label => label === value);
}

export function authorLabel(author: Role, viewer: Role, parentLabel: ParentLabel): string {
  if (author === viewer) return '나';
  return author === 'parent' ? parentLabel : names.child;
}

export function storyHeading(author: Role, viewer: Role, parentLabel: ParentLabel): string {
  return `${authorLabel(author, viewer, parentLabel)}의 이야기`;
}
