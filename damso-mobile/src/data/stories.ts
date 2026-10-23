export type Role = 'parent' | 'child';
export type Story = { id: string; author: Role; authorId?: string; heading?: string; date: string; title: string; question: string; text: string; sample: boolean };
export const questions: Record<Role, string> = {
  parent: '어릴 때 가장\n좋아했던 집밥은\n무엇이었나요?',
  child: '오늘 먹은 음식 중\n기억에 남는 건\n무엇인가요?',
};
export const names: Record<Role, string> = { parent: '지영', child: '민수' };
export const sampleStories: Story[] = [
  { id: 'first-pay', author: 'parent', date: '2026-10-17', title: '첫 월급으로 전한 마음', question: '첫 월급으로 무엇을 하셨나요?', text: '첫 월급을 받아서 어머니께 내복을 사드렸어요. 겨울이 유난히 추웠거든요.\n\n선물을 받으신 어머니가 좋아하셨던 모습이 아직도 기억나요.', sample: true },
  { id: 'dinner', author: 'child', date: '2026-10-17', title: '문득 생각난 엄마의 된장찌개', question: '오늘 먹은 음식 중 기억에 남는 건 무엇인가요?', text: '퇴근하고 된장찌개를 먹었어요. 집에서 먹던 맛이 생각나더라고요.\n\n이번 주말에 집에 가면 같이 밥 먹고 싶어요.', sample: true },
  { id: 'school', author: 'parent', date: '2026-10-16', title: '소풍 가던 날의 김밥', question: '어릴 때 가장 좋아했던 집밥은 무엇이었나요?', text: '소풍 가는 날 아침에 어머니가 싸주시던 김밥이 제일 좋았어요.\n\n옆에서 기다리면 끝부분부터 하나씩 주셨는데, 그게 그렇게 맛있었어요.', sample: true },
];
export function makeStory(answer: string, author: Role, now = new Date()): Story {
  const text = answer.trim();
  if (!text || text.length > 2000) throw new Error('이야기를 1~2,000자로 입력해주세요.');
  if (author !== 'parent' && author !== 'child') throw new Error('사용자 역할을 확인해주세요.');
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);
  return { id: `story-${now.getTime()}`, author, date, title: text.split(/[\n.!?]/)[0].slice(0, 32), question: questions[author].replace(/\n/g, ' '), text, sample: false };
}
export function parseRoomMessage(data: unknown): 'ready' | 'error' | 'album' | 'library' | null {
  try {
    const value = typeof data === 'string' ? JSON.parse(data) : data;
    if (!value || typeof value !== 'object' || !('type' in value)) return null;
    if (value?.type === 'damso-room-ready') return 'ready';
    if (value?.type === 'damso-room-error') return 'error';
    if (value?.type === 'damso-open-album') return 'album';
    if (value?.type === 'damso-open-library') return 'library';
  } catch { /* Unrelated messages are ignored. */ }
  return null;
}
