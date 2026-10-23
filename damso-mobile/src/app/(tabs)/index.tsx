import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../AppState';
import { useBackend, type Draft } from '../../BackendState';
import { Button, Copy, Header, Icon } from '../../components/Ui';
import { VoiceButton } from '../../components/VoiceButton';
import { names, questions } from '../../data/stories';
import { colors, fonts } from '../../theme';

type Mode = 'questions' | 'voice' | 'text' | 'processing' | 'recovery' | 'declined' | 'review' | 'error' | null;
export default function Home() {
  const app = useApp(); const backend = useBackend();
  const role = backend.profile?.role || app.role;
  const daily = backend.questions?.daily;
  const additional = backend.questions?.follow_ups || (backend.questions?.follow_up ? [backend.questions.follow_up] : []);
  const done = (q: { answer_status: string | null }) => q.answer_status === 'submitted' || q.answer_status === 'skipped';
  const familyQuestion = additional.find(q => q.kind === 'family' && !done(q));
  const extra = additional.find(q => !done(q));
  const custom = backend.questions?.custom?.find(q => !done(q));
  const [selectedId, setSelectedId] = useState('');
  const allQuestions = [daily, ...additional, ...(backend.questions?.custom || [])].filter((q): q is NonNullable<typeof q> => !!q);
  const selectedQuestion = allQuestions.find(q => q.id === selectedId && !done(q));
  const question = selectedQuestion || familyQuestion || (daily && !done(daily) ? daily : extra || custom || daily);
  const questionText = question?.text || questions[role];
  const [mode, setMode] = useState<Mode>(null); const [answer, setAnswer] = useState(''); const [error, setError] = useState('');
  const [draft, setDraft] = useState<(Draft & { question_id?: string }) | null>(null); const [summary, setSummary] = useState(''); const [recordingUri, setRecordingUri] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false); const locked = useRef(false); const active = useRef(true);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY); const recording = useAudioRecorderState(recorder);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setDraft(null); setTitle(''); setAnswer(''); setRecordingUri(''); setMode(null); }, [backend.profile?.id, question?.id]);
  useEffect(() => { if (recording.isRecording && recording.durationMillis >= 600000) { void recorder.stop().then(() => setRecordingUri(recorder.uri || '')); } }, [recording.durationMillis, recording.isRecording, recorder]);
  async function poll(id: string) {
    for (let i = 0; i < 100; i++) {
      if (!active.current) return;
      const current = await backend.api<Draft & { question_id: string }>(`/answers/${id}`);
      setDraft(current);
      if (current.organization_status) {
        setSummary(current.summary_draft || ''); setTitle(current.title || '오늘의 이야기');
        setMode(current.organization_status === 'ready' ? 'review' : current.organization_status === 'declined' ? 'declined' : 'recovery'); return;
      }
      const state = await backend.api<{ jobs: Array<{ id: string; status: string; error_code: string | null }> }>(`/answers/${id}/processing`);
      const failed = state.jobs.find(job => job.status === 'failed');
      if (failed) { if (failed.error_code === 'NO_SPEECH' || failed.error_code === 'INVALID_AUDIO') { setMode('recovery'); return; } throw new Error('음성을 처리하지 못했어요. 원래 답변은 보관돼 있어요. 잠시 후 다시 처리해주세요.'); }
      if (state.jobs.some(job => job.status === 'waiting_provider')) throw new Error('음성 또는 요약 서비스의 서버 설정이 필요해요. 원래 답변은 보관돼 있어요.');
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    throw new Error('아직 처리 중이에요. 잠시 후 다시 처리 버튼으로 확인해주세요.');
  }
  async function organize(voice = false) {
    if (locked.current) return;
    if (!backend.connected || backend.family?.status !== 'connected' || !question) { setError('먼저 가족 연결을 완료해주세요.'); return; }
    if (!voice && !answer.trim()) { setError('이야기를 입력해주세요.'); return; }
    locked.current = true; setBusy(true); setError(''); setMode('processing');
    try {
      let body: { text?: string; audio_id?: string } = { text: answer.trim() };
      if (voice) {
        if (!recordingUri) throw new Error('먼저 녹음을 마쳐주세요.');
        const form = new FormData();
        if (Platform.OS === 'web') { const blob = await (await fetch(recordingUri)).blob(); form.append('file', blob, 'recording.webm'); }
        else form.append('file', { uri: recordingUri, name: 'recording.m4a', type: 'audio/mp4' } as unknown as Blob);
        const asset = await backend.api<{ id: string }>('/audio', form); body = { audio_id: asset.id };
      }
      const previous = draft?.question_id === question.id ? draft.id : question.answer_id;
      const next = await backend.api<Draft & { question_id: string }>(previous ? `/answers/${previous}/replace-input` : '/answers', previous ? body : { question_id: question.id, ...body });
      setDraft(next); await poll(next.id);
    } catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했어요. 다시 시도해주세요.'); setMode('error'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function startRecording() {
    if (busy) return;
    try { const permission = await AudioModule.requestRecordingPermissionsAsync(); if (!permission.granted) throw new Error('마이크 사용을 허용하거나 글로 답해주세요.'); await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); await recorder.prepareToRecordAsync(); recorder.record(); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : '녹음을 시작하지 못했어요.'); }
  }
  async function stopRecording() { try { await recorder.stop(); setRecordingUri(recorder.uri || ''); } catch { setError('녹음을 마치지 못했어요. 다시 시도해주세요.'); } }
  async function skip() { try { if (draft) await backend.api(`/answers/${draft.id}/skip`, {}); setMode(null); if (backend.connected) await backend.refresh(); } catch { setError('건너뛰기를 저장하지 못했어요. 다시 시도해주세요.'); } }
  async function submit() {
    if (!draft || !title.trim() || !summary.trim() || busy) return;
    setBusy(true); try { await backend.api(`/answers/${draft.id}/submit`, { title: title.trim(), text: summary.trim(), share_audio: false }); await backend.refresh(); setDraft(null); setTitle(''); setAnswer(''); setRecordingUri(''); setMode(null); router.navigate('/library'); }
    catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했어요.'); } finally { setBusy(false); }
  }
  async function retry() {
    if (!draft) { setMode('text'); return; }
    setBusy(true); setError(''); setMode('processing');
    try { const state = await backend.api<{ jobs: Array<{ id: string; status: string }> }>(`/answers/${draft.id}/processing`); for (const job of state.jobs.filter(item => item.status === 'failed')) await backend.api(`/answers/${draft.id}/processing/${job.id}/retry`, {}); await poll(draft.id); }
    catch (e) { setError(e instanceof Error ? e.message : '다시 처리하지 못했어요.'); setMode('error'); } finally { setBusy(false); }
  }
  async function resume() {
    if (!question?.answer_id || busy) return;
    setBusy(true); setError('');
    try {
      const current = await backend.api<Draft>(`/answers/${question.answer_id}`); setDraft(current);
      setAnswer(current.original_text || current.transcript || ''); setSummary(current.summary_draft || ''); setTitle(current.title || '오늘의 이야기');
      if (current.organization_status) setMode(current.organization_status === 'ready' ? 'review' : current.organization_status === 'declined' ? 'declined' : 'recovery');
      else { setMode('processing'); await poll(current.id); }
    } catch (e) { setError(e instanceof Error ? e.message : '답변을 불러오지 못했어요.'); setMode('error'); }
    finally { setBusy(false); }
  }
  function saveLocal() { try { app.addStory(answer); setAnswer(''); setMode(null); router.navigate('/library'); } catch (e) { setError(e instanceof Error ? e.message : '입력 내용을 확인해주세요.'); } }
  return <SafeAreaView edges={['top']} style={s.screen}><Header companion={role === 'parent' ? backend.connected ? backend.family?.members.find(member => member.id !== backend.profile?.id)?.full_name : names.child : undefined} companionLabel={role === 'child' ? app.parentLabel : undefined} /><ScrollView contentContainerStyle={s.content}>
    <Copy style={s.date}>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</Copy><Copy style={s.greeting}>{backend.profile?.full_name || names[role]}님, 안녕하세요.</Copy><View style={s.divider} />
    {backend.connected && backend.family?.status !== 'connected' ? <><Copy style={s.question}>가족과 연결하고 이야기를 나눠요.</Copy><Copy style={s.help}>연결 전에도 내 서재와 설정은 확인할 수 있어요.</Copy><Button label="가족 연결하기" onPress={() => router.push('/family')} /></> : backend.connected && !question ? <><Copy style={s.help}>오늘의 질문을 불러오지 못했어요.</Copy><Button secondary label="다시 불러오기" onPress={() => { void backend.refresh().catch(e => setError(e instanceof Error ? e.message : '연결을 확인해주세요.')); }} /></> : <>
    <Copy style={s.kicker}>{question?.kind === 'family' ? '가족이 더 궁금해해요' : additional.some(q => q.id === question?.id) ? '오늘의 추가 질문' : '오늘의 질문'}</Copy>{question?.source_title && <Copy style={s.help}>{question.source_title}</Copy>}<Copy accessibilityRole="header" style={s.question}>{questionText}</Copy><View style={[s.divider, s.answerDivider]} />
    {question && done(question) ? <><Copy style={s.help}>오늘의 이야기를 남겼어요.</Copy><Button label="서재에서 보기" onPress={() => router.navigate('/library')} /></> : <><VoiceButton paused={mode !== null} onPress={() => { setError(''); setMode('voice'); }} /><Pressable accessibilityRole="button" onPress={() => { setError(''); setMode('text'); }} style={s.textAction}><Copy style={s.textLink}>글로 남기기</Copy></Pressable></>}
    {question?.answer_id && !done(question) && <Button secondary label={busy ? '답변을 불러오는 중…' : '작성 중인 답변 이어보기'} disabled={busy} onPress={() => { void resume(); }} />}
    {allQuestions.length > 1 && <Pressable accessibilityRole="button" onPress={() => setMode('questions')} style={s.textAction}><Copy style={s.textLink}>오늘의 다른 질문 보기 · {allQuestions.length}개</Copy></Pressable>}
    </>}
    {!!backend.error && <Copy accessibilityRole="alert" style={s.error}>{backend.error}</Copy>}{!!error && mode === null && <Copy accessibilityRole="alert" style={s.error}>{error}</Copy>}
  </ScrollView><Modal visible={mode !== null} animationType="none" transparent onRequestClose={() => { if (!busy && !recording.isRecording) setMode(null); }}><View style={s.scrim}><ScrollView style={s.sheetScroll} contentContainerStyle={s.sheet} keyboardShouldPersistTaps="handled" accessibilityViewIsModal>
    <View style={s.sheetTop}><Copy accessibilityRole="header" style={s.sheetTitle}>{mode === 'questions' ? '오늘의 질문' : mode === 'recovery' ? '이야기를 정리하기 어려웠어요.' : mode === 'declined' ? '오늘은 여기까지 할까요?' : mode === 'review' ? title : mode === 'processing' ? '이야기를 정리하고 있어요' : mode === 'voice' ? '목소리로 답하기' : '오늘의 이야기'}</Copy><Pressable accessibilityRole="button" accessibilityLabel="닫기" disabled={busy || recording.isRecording} onPress={() => setMode(null)} style={s.close}><Icon name="close" /></Pressable></View>
    {mode === 'questions' && allQuestions.map(item => <Button key={item.id} secondary label={`${done(item) ? '완료 · ' : ''}${item.text}`} disabled={done(item)} onPress={() => { setSelectedId(item.id); setMode(null); }} />)}
    {mode === 'voice' && <><Icon name="mic" size={48} /><Copy style={s.help}>{questionText.replace(/\n/g, ' ')}</Copy><Copy accessibilityLiveRegion="polite" style={s.help}>{recording.isRecording ? `${Math.floor(recording.durationMillis / 1000)}초 · 녹음 중이에요` : recordingUri ? '녹음을 마쳤어요. 이 녹음으로 정리할까요?' : '편하게 말씀해주세요. 최대 10분까지 녹음할 수 있어요.'}</Copy><Button label={recording.isRecording ? '녹음 마치기' : recordingUri ? '다시 녹음하기' : '녹음 시작하기'} onPress={() => { void (recording.isRecording ? stopRecording() : startRecording()); }} />{!!recordingUri && !recording.isRecording && <Button label="이 녹음으로 정리하기" onPress={() => { void organize(true); }} />}<Button secondary label="글로 답하기" disabled={recording.isRecording} onPress={() => setMode('text')} /></>}
    {mode === 'text' && <><Copy style={s.help}>{questionText.replace(/\n/g, ' ')}</Copy><TextInput accessibilityLabel="오늘의 이야기 입력" multiline maxLength={2000} placeholder="떠오르는 이야기를 편하게 적어주세요." placeholderTextColor={colors.muted} value={answer} onChangeText={setAnswer} style={s.input} />{!backend.connected && <Copy style={s.sessionNote}>서버 미연결 미리보기예요. 원문 저장은 현재 실행 중에만 유지돼요.</Copy>}<Button label={backend.connected ? '이야기 정리하기' : '원문으로 미리보기 저장'} onPress={() => { if (backend.connected) void organize(); else saveLocal(); }} /></>}
    {mode === 'processing' && <Copy accessibilityLiveRegion="polite" style={s.help}>원래 답변은 보관하고 있어요. 잠시만 기다려주세요.</Copy>}
    {mode === 'recovery' && <><Copy style={s.help}>오늘 질문에 대한 경험을 조금 더 들려주시겠어요?</Copy><Copy style={s.sessionNote}>원래 녹음과 답변은 새 답변을 확정하기 전까지 유지돼요.</Copy><Button label="다시 녹음하기" onPress={() => { setError(''); setMode('voice'); }} /><Button secondary label="글로 답하기" onPress={() => { setError(''); setMode('text'); }} /><Button secondary label="오늘은 건너뛰기" onPress={() => { void skip(); }} /></>}
    {mode === 'declined' && <><Copy style={s.help}>괜찮아요. 이야기하고 싶은 날 다시 들려주세요.</Copy><Button label="오늘은 여기까지" onPress={() => { void skip(); }} /></>}
    {mode === 'review' && <><Copy style={s.help}>내용을 확인하고 고칠 수 있어요.</Copy><TextInput accessibilityLabel="이야기 제목" value={title} onChangeText={setTitle} maxLength={100} style={[s.input, { minHeight: 56, maxHeight: 100 }]} /><TextInput accessibilityLabel="정리된 이야기 확인" multiline value={summary} onChangeText={setSummary} style={s.input} /><Copy style={s.sessionNote}>확인한 글만 가족에게 공개해요. 원본 음성은 자동으로 공유하지 않아요.</Copy><Button label="확인하고 서재에 남기기" disabled={busy || !title.trim() || !summary.trim()} onPress={() => { void submit(); }} /><Button secondary label="답변 다시 쓰기" disabled={busy} onPress={() => setMode('text')} /></>}
    {mode === 'error' && <><Copy style={s.help}>원래 답변을 지우지 않았어요.</Copy><Button label="다시 처리하기" disabled={busy} onPress={() => { void retry(); }} /><Button secondary label="글로 답하기" onPress={() => setMode('text')} /></>}
    {!!error && <Copy accessibilityRole="alert" style={s.error}>{error}</Copy>}
  </ScrollView></View></Modal></SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 26 },
  date: { fontSize: 14, lineHeight: 24, color: colors.muted, marginBottom: 10 }, greeting: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 36, marginBottom: 18 },
  divider: { height: 1, backgroundColor: colors.line, marginBottom: 22 }, answerDivider: { opacity: 0.65, marginBottom: 24 },
  kicker: { fontSize: 18, lineHeight: 28, color: colors.green }, question: { fontFamily: fonts.heavy, fontSize: 34, lineHeight: 53, marginTop: 18, marginBottom: 20 },
  textAction: { minHeight: 54, padding: 14, alignItems: 'center', marginTop: 8 }, textLink: { fontSize: 17, color: colors.muted, textDecorationLine: 'underline' },
  scrim: { flex: 1, backgroundColor: '#35323866', justifyContent: 'center', alignItems: 'center', padding: 18 }, sheetScroll: { width: '100%', maxWidth: 420, maxHeight: '90%', borderRadius: 20, backgroundColor: colors.surface }, sheet: { padding: 24, borderRadius: 20, backgroundColor: colors.surface, gap: 16 },
  sheetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, sheetTitle: { flex: 1, fontSize: 24, lineHeight: 36, fontFamily: fonts.bold }, close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  help: { fontSize: 17, lineHeight: 29, color: colors.muted }, input: { minHeight: 180, maxHeight: 260, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 18, lineHeight: 30, fontFamily: fonts.regular, color: colors.ink, textAlignVertical: 'top', backgroundColor: colors.white },
  sessionNote: { fontSize: 14, lineHeight: 23, color: colors.muted }, error: { fontSize: 16, lineHeight: 25, color: colors.error },
});
