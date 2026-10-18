import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../AppState';
import { Copy, Icon } from '../../components/Ui';
import { names } from '../../data/stories';
import { colors, fonts } from '../../theme';

export default function StoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { stories } = useApp();
  const story = stories.find(item => item.id === id);
  return <SafeAreaView style={s.screen}><Pressable accessibilityRole="button" accessibilityLabel="서재로 돌아가기" onPress={() => router.replace('/library')} style={s.back}><Icon name="back" /><Copy style={s.backLabel}>기억의 서재</Copy></Pressable><ScrollView contentContainerStyle={s.content}>
    {!story ? <Copy>이야기를 찾을 수 없어요.</Copy> : <><Copy style={s.meta}>{story.date.replaceAll('-', '.')} · {names[story.author]}님의 이야기{story.sample ? ' · 예시' : ''}</Copy><Copy accessibilityRole="header" style={s.title}>{story.title}</Copy><Copy style={s.question}>{story.question}</Copy><Copy style={s.body}>{story.text}</Copy><Copy style={s.end}>담소에 남긴, 우리 가족의 한 페이지</Copy></>}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.surface }, back: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 66, paddingHorizontal: 20 }, backLabel: { fontSize: 17, color: colors.green }, content: { padding: 28 }, meta: { fontSize: 14, lineHeight: 24, color: colors.muted }, title: { fontFamily: fonts.heavy, fontSize: 29, lineHeight: 45, marginTop: 20 }, question: { fontSize: 17, lineHeight: 29, color: colors.green, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: colors.line }, body: { fontSize: 20, lineHeight: 38, paddingVertical: 30 }, end: { color: colors.muted, fontSize: 14, lineHeight: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.line } });
