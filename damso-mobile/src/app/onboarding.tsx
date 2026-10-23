import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../AppState';
import { useBackend } from '../BackendState';
import { Button, Copy, Icon } from '../components/Ui';
import { parentLabels } from '../data/family';
import { names } from '../data/stories';
import { colors, fonts } from '../theme';

export default function Onboarding() {
  const app = useApp(); const backend = useBackend();
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState(app.role);
  const [label, setLabel] = useState(app.parentLabel);
  useEffect(() => {
    if (app.preferencesReady) { setRole(app.role); setLabel(app.parentLabel); }
  }, [app.preferencesReady, app.role, app.parentLabel]);
  async function finish(preview = false) {
    setBusy(true); setServerError('');
    try {
      if (backend.connected) {
        await backend.updateProfile({ summary_style: app.summaryStyle });
        if (role === 'child' && backend.family?.status !== 'unlinked') await backend.updateFamilyLabel(label);
        router.replace('/settings'); return;
      }
      if (await app.savePreferences({ role, parentLabel: role === 'child' ? label : app.parentLabel, summaryStyle: app.onboardingComplete ? app.summaryStyle : 'auto', completed: true })) {
        if (preview) { backend.startPreview(); router.replace('/'); }
        else router.push({ pathname: '/account', params: { mode: 'signup' } });
      }
    } catch (e) { setServerError(e instanceof Error ? e.message : '설정을 저장하지 못했어요.'); }
    finally { setBusy(false); }
  }
  if (!app.preferencesReady) return <View style={s.loading}><ActivityIndicator color={colors.green} accessibilityLabel="설정을 불러오는 중" /></View>;
  return <SafeAreaView style={s.screen}>
    <View style={s.nav}><Pressable accessibilityRole="button" accessibilityLabel={app.onboardingComplete ? '설정으로 돌아가기' : '기본 설정으로 시작하기'} disabled={app.preferencesSaving || busy} onPress={() => backend.connected ? router.replace('/settings') : void finish(true)} style={s.back}>{app.onboardingComplete ? <Icon name="back" /> : <Copy style={s.caption}>나중에</Copy>}</Pressable><Copy style={s.brand}>담소</Copy><Copy style={s.step}>첫 설정</Copy></View>
    <ScrollView contentContainerStyle={s.content}>
      <Copy style={s.eyebrow}>우리 가족의 호칭</Copy>
      <Copy accessibilityRole="header" style={s.title}>{'가족을 어떻게\n부르면 좋을까요?'}</Copy>
      <Copy style={s.description}>{'서로의 이야기를 읽을 때\n익숙한 이름과 호칭으로 보여드릴게요.'}</Copy>
        <Copy style={s.label}>나는</Copy><View accessibilityRole="radiogroup" accessibilityLabel="내 역할" style={s.roles}>{(['parent', 'child'] as const).map(value => <Pressable key={value} accessibilityRole="radio" aria-checked={role === value} accessibilityState={{ checked: role === value }} disabled={backend.connected} onPress={() => setRole(value)} style={[s.role, role === value && s.selected]}><Copy style={s.roleText}>{value === 'parent' ? '부모예요' : '자녀예요'}</Copy></Pressable>)}</View>
        {role === 'child' ? <><Copy style={s.label}>부모님을 부르는 호칭</Copy><View accessibilityRole="radiogroup" accessibilityLabel="부모님 호칭" style={s.labels}>{parentLabels.map(value => <Pressable key={value} accessibilityRole="radio" aria-checked={label === value} accessibilityState={{ checked: label === value }} onPress={() => setLabel(value)} style={[s.labelOption, label === value && s.selected]}><Copy style={s.roleText}>{value}</Copy>{label === value && <Icon name="check" size={20} />}</Pressable>)}</View></> : <><Copy style={s.label}>자녀의 이야기는 이름으로</Copy><Copy style={s.description}>가족 연결 후 자녀의 이름이 표시돼요.</Copy></>}
        <View style={s.preview}><Icon name="book" size={24} /><Copy style={s.previewCaption}>기억의 서재에서</Copy><Copy style={s.previewTitle}>{role === 'child' ? label : names.child}의 이야기</Copy><Copy style={s.previewCaption}>{role === 'parent' ? '예시 이름이에요. 내 기록은 ‘나의 이야기’로 보여요.' : '내 기록은 ‘나의 이야기’로 보여요.'}</Copy></View>
      <View style={s.note}><Icon name="mic" size={23} /><View style={s.noteBody}><Copy style={s.noteTitle}>녹음된 평소 말투와 비슷하게 요약해요</Copy><Copy style={s.noteText}>내가 직접 말하는 1인칭으로, 반복만 덜어내요. 말투가 분명하지 않으면 편안한 존댓말로 정리해요.</Copy><Copy style={s.caption}>원하는 문체가 있다면 나중에 설정에서 바꿀 수 있어요.</Copy></View></View>
      {!!serverError && <Copy accessibilityRole="alert" style={s.error}>{serverError}</Copy>}{!!app.preferencesError && <Copy accessibilityRole="alert" style={s.error}>{app.preferencesError}</Copy>}
    </ScrollView>
    <View style={s.footer}><Copy style={s.caption}>호칭은 나중에 설정에서 바꿀 수 있어요.</Copy>{!backend.connected && <Button secondary label="이미 계정이 있어요" onPress={() => router.push('/account')} />}<Button label={busy || app.preferencesSaving ? '저장하고 있어요…' : backend.connected ? '설정 저장하기' : '계정 만들기'} disabled={app.preferencesSaving || busy} onPress={() => { void finish(); }} /></View>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, minHeight: 72 }, back: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }, brand: { fontFamily: fonts.brand, fontSize: 34, lineHeight: 44 }, step: { color: colors.muted, fontSize: 14, width: 48, textAlign: 'right' }, content: { padding: 26, paddingTop: 30, paddingBottom: 24 }, eyebrow: { fontSize: 14, lineHeight: 24, color: colors.green, fontFamily: fonts.bold }, title: { fontSize: 29, lineHeight: 43, fontFamily: fonts.heavy, marginTop: 13 }, description: { fontSize: 17, lineHeight: 28, color: colors.muted, marginTop: 12 }, label: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 27, marginTop: 28 }, roles: { flexDirection: 'row', gap: 12, marginTop: 12 }, role: { flex: 1, minHeight: 58, borderWidth: 1, borderColor: colors.line, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, roleText: { fontSize: 18, lineHeight: 28, fontFamily: fonts.bold }, selected: { backgroundColor: colors.sage, borderColor: colors.green }, labels: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }, labelOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minWidth: 90, flexGrow: 1, minHeight: 58, padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 12 }, preview: { alignItems: 'center', gap: 9, marginTop: 30, paddingVertical: 26, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }, previewTitle: { fontFamily: fonts.bold, fontSize: 25, lineHeight: 36, color: colors.green }, previewCaption: { fontSize: 13, lineHeight: 23, color: colors.muted, textAlign: 'center' }, footer: { borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 26, paddingTop: 12, paddingBottom: 18, gap: 12 }, caption: { color: colors.muted, fontSize: 13, lineHeight: 22 }, note: { flexDirection: 'row', gap: 12, marginTop: 28, paddingTop: 4 }, noteBody: { flex: 1, gap: 10 }, noteTitle: { fontFamily: fonts.bold, color: colors.green, fontSize: 17, lineHeight: 28 }, noteText: { color: colors.muted, fontSize: 15, lineHeight: 26 }, error: { color: colors.error, marginTop: 14, fontSize: 16 },
});
