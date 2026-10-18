import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function RootHtml({ children }: PropsWithChildren) {
  return <html lang="ko"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>담소 · 우리 가족의 이야기</title><ScrollViewStyleReset /></head><body>{children}</body></html>;
}
