import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBackend } from '../BackendState';
import { Button, Copy, Icon } from '../components/Ui';
import { colors, fonts } from '../theme';
type Notification = { id: string; kind: string; resource_id: string | null; read: boolean; created_at: string };
const labels: Record<string, string> = { family_connected: '가족이 담소에 연결됐어요.', custom_question: '가족이 질문을 보냈어요.', story_shared: '가족이 새 이야기를 남겼어요.', story_comment: '이야기에 댓글이 도착했어요.', story_reaction: '가족이 이야기에 공감했어요.' };
export default function Notifications() {
  const backend = useBackend(); const [items, setItems] = useState<Notification[]>([]); const [next, setNext] = useState<number | null>(0); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function load(skip: number) { setBusy(true); setError(''); try { const data = await backend.api<Notification[]>(`/notifications?limit=30&skip=${skip}`); setItems(current => skip ? [...current, ...data] : data); setNext(data.length === 30 ? skip + 30 : null); } catch (e) { setError(e instanceof Error ? e.message : '새 소식을 불러오지 못했어요.'); } finally { setBusy(false); } }
  useEffect(() => { setItems([]); if (backend.connected) void load(0); }, [backend.profile?.id]);
  async function open(item: Notification) {
    if (busy) return; setBusy(true); setError('');
    try {
      await backend.api(`/notifications/${item.id}/read`, {}, 'PATCH'); setItems(current => current.map(value => value.id === item.id ? { ...value, read: true } : value));
      if (item.kind.startsWith('story_') && item.resource_id) router.push({ pathname: '/story/[id]', params: { id: item.resource_id } });
      else if (item.kind === 'family_connected') { await backend.refresh(); router.push('/family'); }
      else { await backend.refresh(); router.replace('/'); }
    } catch (e) { setError(e instanceof Error ? e.message : '소식을 열지 못했어요.'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={s.screen}><Pressable accessibilityRole="button" accessibilityLabel="설정으로 돌아가기" onPress={() => router.replace('/settings')} style={s.back}><Icon name="back" /><Copy>설정</Copy></Pressable><ScrollView contentContainerStyle={s.content}>
    <Copy accessibilityRole="header" style={s.title}>새 소식</Copy>
    {!backend.connected ? <Button label="로그인하기" onPress={() => router.push('/account')} /> : <>
      <Button secondary label="새로고침" disabled={busy} onPress={() => { void load(0); }} />
      {!items.length && !busy && <Copy>아직 도착한 소식이 없어요.</Copy>}
      {items.map(item => <Pressable accessibilityRole="button" accessibilityLabel={`${item.read ? '읽음' : '새 소식'}, ${labels[item.kind] || '새 소식이 도착했어요.'}`} key={item.id} disabled={busy} onPress={() => { void open(item); }} style={s.item}><Copy style={[s.message, !item.read && { color: colors.green, fontFamily: fonts.bold }]}>{labels[item.kind] || '새 소식이 도착했어요.'}</Copy><Copy style={s.meta}>{new Date(item.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {item.read ? '읽음' : '읽지 않음'}</Copy></Pressable>)}
      {next !== null && <Button secondary label={busy ? '불러오는 중…' : '이전 소식 더 보기'} disabled={busy} onPress={() => { void load(next); }} />}
    </>}{!!error && <Copy accessibilityRole="alert" style={s.error}>{error}</Copy>}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.surface }, back: { minHeight: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }, content: { padding: 28, gap: 20 }, title: { fontFamily: fonts.heavy, fontSize: 30, lineHeight: 45 }, item: { paddingVertical: 24, borderBottomColor: colors.line, borderBottomWidth: 1, gap: 12 }, message: { fontSize: 19, lineHeight: 30 }, meta: { fontSize: 14, color: colors.muted, lineHeight: 24 }, error: { color: colors.error } });
