import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useBackend } from '../../BackendState';
import { Button } from '../../components/Ui';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../AppState';
import { Copy, Icon } from '../../components/Ui';
import { storyHeading } from '../../data/family';
import { StoryOriginal } from '../../components/StoryOriginal';
import { StoryPhotos } from '../../components/StoryPhotos';
import { nextHandwriting, storyHandwriting } from '../../data/handwriting';
import { colors, fonts } from '../../theme';

export default function StoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { stories: previewStories, role, parentLabel } = useApp();
  const backend = useBackend(); const stories = backend.connected ? backend.stories : previewStories;
  const [handwriting, setHandwriting] = useState(0);
  useEffect(() => { setHandwriting(0); }, [id]);
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  async function askMore() { if (!backend.connected) { setNotice('설정에서 서버 계정에 연결하면 내일 질문을 예약할 수 있어요.'); return; } setBusy(true); try { const result = await backend.api<{scheduled_for: string}>(`/library/${id}/follow-up`, {}); setNotice(`${result.scheduled_for.replaceAll('-', '.')}에 가족에게 이 이야기의 추가 질문을 전할게요.`); } catch (e) { setNotice(e instanceof Error ? e.message : '예약하지 못했어요.'); } finally { setBusy(false); } }
  const story = stories.find(item => item.id === id);
  return <SafeAreaView style={s.screen}><Pressable accessibilityRole="button" accessibilityLabel="서재로 돌아가기" onPress={() => router.replace('/library')} style={s.back}><Icon name="back" /><Copy style={s.backLabel}>기억의 서재</Copy></Pressable><ScrollView contentContainerStyle={s.content}>
    {!story ? <Copy>이야기를 찾을 수 없어요.</Copy> : <><Copy style={s.meta}>{story.date.replaceAll('-', '.')} · {storyHeading(story.author, role, parentLabel)}{story.sample ? ' · 예시' : ''}</Copy><Copy accessibilityRole="header" style={s.title}>{story.title}</Copy><View style={s.questionRow}><Copy style={s.question}>{story.question}</Copy><Pressable accessibilityRole="button" accessibilityLabel="다른 글씨체로 보기" accessibilityHint="이야기 본문의 글씨체를 바꿔요" onPress={() => setHandwriting(nextHandwriting(handwriting))} style={s.fontButton}><Copy style={s.fontIcon}>T</Copy></Pressable></View><Copy style={[s.body, { fontFamily: storyHandwriting[handwriting] }]}>{story.text}</Copy><StoryOriginal key={`${backend.profile?.id}:${story.id}`} answerId={story.id} /><StoryPhotos answerId={story.id} canUpload={story.author === (backend.profile?.role || role)} /><View style={{ gap: 16, paddingBottom: 28 }}>{story.author !== (backend.profile?.role || role) && <><Button label={busy ? "예약 중…" : "이 이야기가 더 궁금해요"} disabled={busy} onPress={() => { void askMore(); }} /><Copy style={s.meta}>다음 날 가족에게 추가 질문을 전해요. 하루에 한 이야기만 요청할 수 있어요.</Copy>{!!notice && <Copy accessibilityLiveRegion="polite" style={s.question}>{notice}</Copy>}</>}</View><Copy style={s.end}>담소에 남긴, 우리 가족의 한 페이지</Copy></>}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.surface }, back: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 66, paddingHorizontal: 20 }, backLabel: { fontSize: 17, color: colors.green }, content: { padding: 28 }, meta: { fontSize: 14, lineHeight: 24, color: colors.muted }, title: { fontFamily: fonts.heavy, fontSize: 29, lineHeight: 45, marginTop: 20 }, questionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line }, question: { flex: 1, fontSize: 17, lineHeight: 29, color: colors.green, paddingVertical: 22 }, fontButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 }, fontIcon: { fontSize: 23, lineHeight: 30, color: colors.green, fontFamily: fonts.bold, textDecorationLine: 'underline' }, body: { fontSize: 26, lineHeight: 44, paddingVertical: 30 }, end: { color: colors.muted, fontSize: 14, lineHeight: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.line } });
