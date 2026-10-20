import { useBackend } from '../../BackendState';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../AppState';
import { Button, Copy, Header, Icon } from '../../components/Ui';
import { type Role } from '../../data/stories';
import { storyHeading } from '../../data/family';
import { colors, fonts } from '../../theme';

export default function Library() {
  const { stories: previewStories, role, parentLabel } = useApp();
  const backend = useBackend(); const stories = backend.connected ? backend.stories : previewStories;
  const [filter, setFilter] = useState<'all' | Role>('all');
  const visible = stories.filter(story => filter === 'all' || story.author === filter);
  return <SafeAreaView edges={['top']} style={s.screen}><Header /><ScrollView contentContainerStyle={s.content}>
    <Copy accessibilityRole="header" style={s.title}>기억의 서재</Copy><Copy style={s.intro}>우리 가족의 이야기가{`\n`}차곡차곡 쌓이는 곳.</Copy>
    <View style={s.shelf} accessible={false}><View style={s.books}>{[78, 98, 88, 106, 82, 94, 72].map((height, i) => <View key={i} style={[s.book, { height, backgroundColor: [colors.green, '#8c9977', colors.sand, '#b5b59a'][i % 4], transform: [{ rotate: i === 5 ? '9deg' : '0deg' }] }]}><View style={s.spine} /></View>)}</View><View style={s.shelfLine} /></View>
    <Pressable accessibilityRole="button" accessibilityLabel="3D 화면으로 보기" onPress={() => router.push('/library-3d')} style={({ pressed }) => [s.roomLink, pressed && { opacity: 0.75 }]}><View style={s.roomCopy}><Icon name="cube" size={30} /><View style={s.roomWords}><Copy style={s.roomTitle}>3D 화면으로 보기</Copy><Copy style={s.roomHint}>우리 가족의 서재를 둘러보세요</Copy></View></View><Icon name="arrow" size={24} /></Pressable>
    <Button secondary label="가족 앨범 보기" onPress={() => router.push('/album')} />
    <View style={s.section}><Copy style={s.sectionTitle}>남겨둔 이야기</Copy><Copy style={s.sample}>{backend.connected ? '가족 기록' : '예시 포함'} · {stories.length}개</Copy></View>
    <View style={s.filters}>{(['all', 'parent', 'child'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[s.filter, filter === value && s.filterActive]}><Copy style={[s.filterLabel, filter === value && { color: colors.surface }]}>{value === 'all' ? '전체' : storyHeading(value, role, parentLabel)}</Copy></Pressable>)}</View>
    {visible.length === 0 && <Copy style={s.empty}>아직 남긴 이야기가 없어요.</Copy>}
    {visible.map(story => <Pressable key={story.id} accessibilityRole="button" accessibilityLabel={`${story.title}, ${storyHeading(story.author, role, parentLabel)}`} onPress={() => router.push({ pathname: '/story/[id]', params: { id: story.id } })} style={({ pressed }) => [s.story, pressed && { opacity: 0.65 }]}><View style={s.calendar}><Copy style={s.day}>{story.date.slice(-2)}</Copy><Copy style={s.month}>{Number(story.date.slice(5, 7))}월</Copy></View><View style={s.storyCopy}><Copy style={s.author}>{storyHeading(story.author, role, parentLabel)}{story.sample ? ' · 예시' : ''}</Copy><Copy style={s.storyTitle}>{story.title}</Copy></View><Icon name="arrow" size={20} /></Pressable>)}
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 26, paddingTop: 18, paddingBottom: 32 }, title: { fontSize: 32, lineHeight: 48, fontFamily: fonts.heavy }, intro: { marginTop: 12, color: colors.muted, fontSize: 18, lineHeight: 30 },
  shelf: { paddingTop: 24, marginBottom: 24 }, books: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, paddingHorizontal: 14 }, book: { width: 29, borderRadius: 3, paddingVertical: 12, alignItems: 'center', justifyContent: 'space-between' }, spine: { width: 17, height: 3, backgroundColor: '#ffffff66', marginTop: 5 }, shelfLine: { height: 9, borderRadius: 3, backgroundColor: '#c9bba5', marginTop: 2 },
  roomLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: colors.sage, borderRadius: 14, padding: 18, minHeight: 94 }, roomCopy: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }, roomWords: { flex: 1 }, roomTitle: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 29, color: colors.green }, roomHint: { fontSize: 14, lineHeight: 23, color: colors.muted, marginTop: 3 },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 34 }, sectionTitle: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 34 }, sample: { fontSize: 13, lineHeight: 22, color: colors.muted },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 18 }, filter: { minHeight: 48, minWidth: 64, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 24, borderWidth: 1, borderColor: colors.line }, filterActive: { backgroundColor: colors.green, borderColor: colors.green }, filterLabel: { fontSize: 16, lineHeight: 25, color: colors.muted },
  story: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: colors.line, minHeight: 100 }, calendar: { width: 42, alignItems: 'center' }, day: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 37 }, month: { fontSize: 14, lineHeight: 22, color: colors.muted }, storyCopy: { flex: 1 }, author: { color: colors.muted, fontSize: 14, lineHeight: 23, marginBottom: 5 }, storyTitle: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 30 }, empty: { paddingVertical: 32, color: colors.muted },
});
