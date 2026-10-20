import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useBackend } from '../BackendState';
import { Button, Copy, Icon } from '../components/Ui';
import { PhotoViewer, PrivatePhoto, type Photo } from '../components/StoryPhotos';
import { colors, fonts } from '../theme';

export default function Album() {
  const backend = useBackend(); const [photos, setPhotos] = useState<Photo[]>([]); const [next, setNext] = useState<number | null>(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [selected, setSelected] = useState<Photo | null>(null);
  async function load(skip: number) {
    setBusy(true); setError('');
    try { const result = await backend.api<{data: Photo[]; next_skip: number | null}>(`/photos/album?skip=${skip}`); setPhotos(items => skip === 0 ? result.data : [...items, ...result.data]); setNext(result.next_skip); }
    catch { setError('앨범을 불러오지 못했어요. 다시 시도해주세요.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { setPhotos([]); setSelected(null); if (backend.connected) void load(0); }, [backend.connected, backend.profile?.id]);
  return <SafeAreaView style={s.screen}><Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back}><Icon name="back" /><Copy>기억의 서재</Copy></Pressable>
    <ScrollView contentContainerStyle={s.content}><Copy accessibilityRole="header" style={s.title}>가족 앨범</Copy><Copy style={s.hint}>이야기와 함께 남긴 사진을 모았어요.</Copy>
      {!backend.connected ? <Copy>가족 계정으로 로그인하면 사진을 볼 수 있어요.</Copy> : <>
        {!busy && !photos.length && !error && <Copy>아직 사진이 없어요. 서재에서 내 이야기를 열고 관련 사진을 등록해주세요.</Copy>}
        <View style={s.grid}>{photos.map(photo => <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel="앨범 사진 크게 보기" style={s.cell} onPress={() => setSelected(photo)}><PrivatePhoto photo={photo} /></Pressable>)}</View>
        {next !== null && <Button secondary label={busy ? '사진을 불러오는 중…' : '사진 더 보기'} disabled={busy} onPress={() => { void load(next); }} />}
        {!!error && <Copy accessibilityRole="alert" style={s.error}>{error}</Copy>}
      </>}
    </ScrollView><PhotoViewer photo={selected} onClose={() => setSelected(null)} /></SafeAreaView>;
}
const s = StyleSheet.create({screen: { flex: 1, backgroundColor: colors.surface }, back: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64, paddingHorizontal: 24 }, content: { padding: 26, gap: 24 }, title: { fontFamily: fonts.heavy, fontSize: 30, lineHeight: 44 }, hint: { color: colors.muted, fontSize: 17 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, cell: { width: '47%' }, error: { color: colors.error }});
