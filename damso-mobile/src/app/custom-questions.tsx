import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBackend } from '../BackendState';
import { Button, Copy, Field, Icon } from '../components/Ui';
import { colors, fonts } from '../theme';

type Question = { id: string; text: string; created_by: string; available_date: string; canceled: boolean };
export default function CustomQuestions() {
  const backend = useBackend(); const [items, setItems] = useState<Question[]>([]);
  const [text, setText] = useState(''); const [date, setDate] = useState(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [next, setNext] = useState<number | null>(0);
  async function load(skip = 0) { const data = await backend.api<Question[]>(`/questions/custom?limit=30&skip=${skip}`); setItems(current => skip ? [...current, ...data] : data); setNext(data.length === 30 ? skip + 30 : null); }
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '질문을 처리하지 못했어요.'); } finally { setBusy(false); } }
  useEffect(() => { setItems([]); if (backend.family?.status === 'connected') void run(() => load()); }, [backend.profile?.id, backend.family?.family_id]);
  return <SafeAreaView style={s.screen}><Pressable accessibilityRole="button" accessibilityLabel="설정으로 돌아가기" onPress={() => router.replace('/settings')} style={s.back}><Icon name="back" /><Copy>설정</Copy></Pressable><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Copy accessibilityRole="header" style={s.title}>자녀에게 질문하기</Copy>
    {backend.family?.status !== 'connected' ? <><Copy>가족을 연결하면 질문을 보낼 수 있어요.</Copy><Button label="가족 연결하기" onPress={() => router.push('/family')} /></> : <>
      {backend.profile?.role === 'parent' && <><Copy style={s.hint}>자녀에게 궁금한 것을 물어보세요. 기본·꼬리질문을 포함해 자녀가 받는 질문은 하루 최대 3개예요.</Copy><Field label="물어보고 싶은 이야기" value={text} onChangeText={setText} maxLength={500} multiline editable={!busy} /><Field label="질문을 보낼 날짜" value={date} onChangeText={setDate} maxLength={10} placeholder="2026-10-22" editable={!busy} /><Copy style={s.hint}>오늘부터 30일 이내 날짜를 입력해주세요.</Copy><Button label={busy ? '처리 중…' : '질문 보내기'} disabled={busy || !text.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onPress={() => { void run(async () => { await backend.api('/questions/custom', { text: text.trim(), available_date: date }); setText(''); await load(); await backend.refresh(); setNotice('질문을 보냈어요. 자녀의 해당 날짜 질문에 표시돼요.'); }); }} /></>}
      {!!notice && <Copy accessibilityLiveRegion="polite" style={s.hint}>{notice}</Copy>}<Copy style={s.heading}>보낸 질문</Copy>
      {!items.length && !busy && <Copy style={s.hint}>아직 보낸 질문이 없어요.</Copy>}
      {items.map(item => <View key={item.id} style={s.item}><Copy style={s.hint}>{item.available_date} · {item.canceled ? '취소됨' : '전달됨'}</Copy><Copy>{item.text}</Copy>{!item.canceled && item.created_by === backend.profile?.id && <Button secondary label="미답변 질문 취소하기" disabled={busy} onPress={() => { void run(async () => { await backend.api(`/questions/custom/${item.id}`, undefined, 'DELETE'); await load(); setNotice('질문을 취소했어요.'); }); }} />}</View>)}
      {next !== null && <Button secondary label="질문 더 보기" disabled={busy} onPress={() => { void run(() => load(next)); }} />}
    </>}{!!error && <Copy accessibilityRole="alert" style={s.error}>{error}</Copy>}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.surface }, back: { minHeight: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }, content: { padding: 28, gap: 20 }, title: { fontFamily: fonts.heavy, fontSize: 28, lineHeight: 42 }, heading: { fontFamily: fonts.bold, fontSize: 22, marginTop: 15 }, hint: { color: colors.muted, fontSize: 15, lineHeight: 25 }, item: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 20 }, error: { color: colors.error, fontSize: 16 } });
