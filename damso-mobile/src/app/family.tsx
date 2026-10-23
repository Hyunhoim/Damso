import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBackend } from '../BackendState';
import { useApp } from '../AppState';
import { Button, Copy, Field, Icon } from '../components/Ui';
import { colors, fonts } from '../theme';

type Invitation = { code: string; expires_at: string };
type Preview = { full_name: string; role: 'parent' | 'child'; expires_at: string };
export default function FamilyConnection() {
  const backend = useBackend(); const app = useApp();
  const [code, setCode] = useState(''); const [invite, setInvite] = useState<Invitation | null>(null); const [person, setPerson] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => { setInvite(null); setPerson(null); setCode(''); }, [backend.profile?.id]);
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '가족 연결을 처리하지 못했어요.'); } finally { setBusy(false); } }
  const partner = backend.family?.members.find(member => member.id !== backend.profile?.id);
  async function join() {
    await backend.api('/families/join', { code }); setPerson(null); await backend.refresh();
    if (backend.profile?.role === 'child') await backend.updateFamilyLabel(app.parentLabel);
  }
  if (!backend.ready) return <ActivityIndicator color={colors.green} />;
  return <SafeAreaView style={s.screen}><Pressable accessibilityRole="button" accessibilityLabel="홈으로 돌아가기" onPress={() => router.replace('/')} style={s.back}><Icon name="back" /><Copy>담소</Copy></Pressable><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Copy accessibilityRole="header" style={s.title}>{backend.family?.status === 'connected' ? '함께할 가족이\n연결됐어요.' : '이제 가족과\n연결해 볼까요?'}</Copy>
    {!backend.connected ? <><Copy style={s.hint}>계정을 만들거나 로그인한 뒤 가족을 연결해주세요.</Copy><Button label="로그인하기" onPress={() => router.replace('/account')} /></> : backend.family?.status === 'connected' ? <>
      <View style={s.box}><Icon name="check" size={36} /><Copy style={s.person}>{partner?.full_name || '가족'}님</Copy><Copy style={s.hint}>{partner?.role === 'parent' ? '부모' : '자녀'} 계정과 함께하고 있어요.</Copy></View>
      <Button label="담소 시작하기" onPress={() => router.replace('/')} />
      {!confirmLeave ? <Button secondary label="가족 연결 해제" onPress={() => setConfirmLeave(true)} /> : <><Copy style={s.hint}>연결을 해제하면 서로의 기록을 볼 수 없어요. 각자의 기록은 남겨둬요.</Copy><Button label="확인 · 연결 해제하기" disabled={busy} onPress={() => { void run(async () => { await backend.api('/families/me', undefined, 'DELETE'); setInvite(null); setConfirmLeave(false); await backend.refresh(); }); }} /><Button secondary label="취소" onPress={() => setConfirmLeave(false)} /></>}
    </> : <>
      <Copy style={s.hint}>부모와 자녀 중 한 사람이 코드를 만들고, 다른 한 사람이 입력해주세요.</Copy>
      {invite && <View style={s.box}><Copy style={s.hint}>우리 가족 연결 코드</Copy><Copy selectable style={s.code}>{invite.code}</Copy><Copy style={s.hint}>{new Date(invite.expires_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지 입력할 수 있어요. 재발급하면 이전 코드는 만료돼요.</Copy><Copy accessibilityLiveRegion="polite" style={s.hint}>가족의 연결을 기다리고 있어요.</Copy></View>}
      <Button label={busy ? '처리하고 있어요…' : invite || backend.family?.status === 'waiting' ? '새 연결 코드 만들기' : '연결 코드 만들기'} disabled={busy} onPress={() => { void run(async () => { const chosenLabel = app.parentLabel; setInvite(await backend.api<Invitation>('/families/invitations', {})); setPerson(null); if (backend.profile?.role === 'child') await backend.updateFamilyLabel(chosenLabel); await backend.refresh(); }); }} />
      {backend.family?.status === 'waiting' ? <><Copy style={s.hint}>가족이 만든 코드를 입력하려면 내 대기 연결을 먼저 해제해주세요.</Copy><Button secondary label="대기 연결 해제하고 코드 입력하기" disabled={busy} onPress={() => { void run(async () => { await backend.api('/families/me', undefined, 'DELETE'); setInvite(null); await backend.refresh(); }); }} /><Button secondary label="연결 상태 확인하기" disabled={busy} onPress={() => { void run(backend.refresh); }} /></> : <>
        <Field label="가족에게 받은 연결 코드" autoCapitalize="characters" maxLength={6} value={code} editable={!busy} placeholder="영문과 숫자 6자리" onChangeText={value => { setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setPerson(null); }} />
        {person ? <View style={s.box}><Copy style={s.person}>{person.full_name}님이 맞나요?</Copy><Copy style={s.hint}>{person.role === 'parent' ? '부모' : '자녀'} 계정이에요. 아는 가족인지 꼭 확인해주세요.</Copy><Button label="맞아요 · 가족 연결하기" disabled={busy || person.role === backend.profile?.role} onPress={() => { void run(join); }} />{person.role === backend.profile?.role && <Copy style={s.error}>같은 역할끼리는 연결할 수 없어요.</Copy>}</View> : <Button secondary label="가족 확인하기" disabled={busy || !/^[A-HJ-NP-Z2-9]{6}$/.test(code)} onPress={() => { void run(async () => setPerson(await backend.api<Preview>('/families/invitations/preview', { code }))); }} />}
      </>}
      <Button secondary label="나중에 연결하기" disabled={busy} onPress={() => router.replace('/')} />
    </>}
    {!!error && <Copy accessibilityRole="alert" style={s.error}>{error}</Copy>}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.surface }, back: { minHeight: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }, content: { padding: 28, gap: 24 }, title: { fontFamily: fonts.heavy, fontSize: 30, lineHeight: 45 }, hint: { fontSize: 16, lineHeight: 27, color: colors.muted }, box: { padding: 24, borderWidth: 1, borderColor: colors.line, borderRadius: 16, gap: 18, alignItems: 'stretch' }, person: { fontFamily: fonts.bold, fontSize: 23, lineHeight: 34 }, code: { fontFamily: fonts.bold, fontSize: 34, letterSpacing: 5, color: colors.green }, error: { color: colors.error, fontSize: 16, lineHeight: 26 } });
