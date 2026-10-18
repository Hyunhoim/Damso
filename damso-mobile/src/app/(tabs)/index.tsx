import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../AppState';
import { Button, Copy, Header, Icon } from '../../components/Ui';
import { VoiceButton } from '../../components/VoiceButton';
import { names, questions } from '../../data/stories';
import { colors, fonts } from '../../theme';

export default function Home() {
  const { role, addStory } = useApp();
  const [mode, setMode] = useState<'voice' | 'text' | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  function save() {
    try { addStory(answer); setAnswer(''); setMode(null); setError(''); router.navigate('/library'); }
    catch (e) { setError(e instanceof Error ? e.message : '다시 시도해주세요.'); }
  }
  return <SafeAreaView edges={['top']} style={s.screen}><Header companion={names[role === 'parent' ? 'child' : 'parent']} /><ScrollView contentContainerStyle={s.content}>
    <Copy style={s.date}>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</Copy>
    <Copy style={s.greeting}>{names[role]}님, 안녕하세요.</Copy>
    <View style={s.divider} />
    <Copy style={s.kicker}>오늘의 질문</Copy><Copy accessibilityRole="header" style={s.question}>{questions[role]}</Copy>
    <View style={[s.divider, s.answerDivider]} />
    <VoiceButton paused={mode !== null} onPress={() => setMode('voice')} />
    <Pressable accessibilityRole="button" onPress={() => { setError(''); setMode('text'); }} style={s.textAction}><Copy style={s.textLink}>글로 남기기</Copy></Pressable>
  </ScrollView>
  <Modal visible={mode !== null} animationType="none" transparent onRequestClose={() => setMode(null)}><View style={s.scrim}><View style={s.sheet} accessibilityViewIsModal>
    <View style={s.sheetTop}><Copy accessibilityRole="header" style={s.sheetTitle}>{mode === 'voice' ? '목소리로 답하기' : '오늘의 이야기'}</Copy><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setMode(null)} style={s.close}><Icon name="close" /></Pressable></View>
    {mode === 'voice' ? <><Icon name="mic" size={48} /><Copy style={s.help}>음성 녹음은 아직 준비 중이에요.{`\n`}지금은 글로 이야기를 남길 수 있어요.</Copy><Button label="글로 이야기 남기기" onPress={() => { setError(''); setMode('text'); }} /></> : <><Copy style={s.help}>{questions[role].replace(/\n/g, ' ')}</Copy><TextInput accessibilityLabel="오늘의 이야기 입력" multiline maxLength={2000} placeholder="떠오르는 이야기를 편하게 적어주세요." placeholderTextColor={colors.muted} value={answer} onChangeText={setAnswer} style={s.input} /><Copy style={s.sessionNote}>미리보기 기록은 현재 실행 중에만 보관돼요.</Copy>{!!error && <Copy accessibilityRole="alert" style={s.error}>{error}</Copy>}<Button label="서재에 남기기" onPress={save} /></>}
  </View></View></Modal></SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 26 },
  date: { fontSize: 14, lineHeight: 24, color: colors.muted, marginBottom: 10 }, greeting: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 36, marginBottom: 18 },
  divider: { height: 1, backgroundColor: colors.line, marginBottom: 22 }, answerDivider: { opacity: 0.65, marginBottom: 24 },
  kicker: { fontSize: 18, lineHeight: 28, color: colors.green }, question: { fontFamily: fonts.heavy, fontSize: 34, lineHeight: 53, marginTop: 18, marginBottom: 20 },
  textAction: { minHeight: 54, padding: 14, alignItems: 'center', marginTop: 8 }, textLink: { fontSize: 17, color: colors.muted, textDecorationLine: 'underline' },
  scrim: { flex: 1, backgroundColor: '#35323866', justifyContent: 'center', alignItems: 'center', padding: 18 }, sheet: { width: '100%', maxWidth: 420, padding: 24, borderRadius: 20, backgroundColor: colors.surface, gap: 16 },
  sheetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, sheetTitle: { fontSize: 24, lineHeight: 36, fontFamily: fonts.bold }, close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  help: { fontSize: 17, lineHeight: 29, color: colors.muted }, input: { minHeight: 180, maxHeight: 260, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 18, lineHeight: 30, fontFamily: fonts.regular, color: colors.ink, textAlignVertical: 'top', backgroundColor: colors.white },
  sessionNote: { fontSize: 14, lineHeight: 23, color: colors.muted }, error: { fontSize: 16, lineHeight: 25, color: colors.error },
});
