import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Copy, Icon } from '../components/Ui';
import RoomSurface from '../components/RoomSurface';
import { colors, fonts } from '../theme';

export default function Library3D() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const ready = useCallback(() => setStatus('ready'), []);
  const fail = useCallback(() => setStatus('error'), []);
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(fail, 60000);
    return () => clearTimeout(timer);
  }, [attempt, status, fail]);
  return <SafeAreaView style={s.screen}><View style={s.toolbar}><Pressable accessibilityRole="button" accessibilityLabel="2D 서재로 돌아가기" onPress={() => router.replace('/library')} style={s.back}><Icon name="back" /><Copy style={s.backText}>2D 서재로</Copy></Pressable><Copy style={s.title}>기억의 서재</Copy></View>
    <View style={s.room} testID="room-viewer">{status !== 'error' && <RoomSurface key={attempt} onReady={ready} onError={fail} onOpenAlbum={() => router.push('/album')} onOpenLibrary={() => router.push('/library')} />}
      {status !== 'ready' && <View style={s.overlay} accessibilityLiveRegion="polite">{status === 'loading' ? <><ActivityIndicator size="large" color={colors.green} /><Copy style={s.loadingTitle}>서재의 문을 열고 있어요</Copy><Copy style={s.helper}>처음에는 조금 걸릴 수 있어요.</Copy></> : <><Icon name="book" size={48} /><Copy style={s.loadingTitle}>서재를 불러오지 못했어요</Copy><Copy style={s.helper}>연결 상태를 확인하고 다시 시도해주세요.</Copy><Button label="다시 불러오기" onPress={() => { setAttempt(value => value + 1); setStatus('loading'); }} style={{ alignSelf: 'stretch', marginTop: 16 }} /><Button label="2D 서재로 돌아가기" secondary onPress={() => router.replace('/library')} style={{ alignSelf: 'stretch' }} /></>}</View>}
    </View><Copy style={s.hint}>책은 이야기로, 액자는 가족 앨범으로 이어져요.</Copy></SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, toolbar: { minHeight: 72, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomColor: colors.line, borderBottomWidth: 1 }, back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 52, paddingRight: 8 }, backText: { fontSize: 16, lineHeight: 26, color: colors.green }, title: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 28 },
  room: { flex: 1, position: 'relative', backgroundColor: colors.paper }, overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, padding: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 12 }, loadingTitle: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 35, textAlign: 'center', marginTop: 12 }, helper: { fontSize: 16, lineHeight: 27, color: colors.muted, textAlign: 'center' }, hint: { fontSize: 14, lineHeight: 24, textAlign: 'center', paddingVertical: 14, paddingHorizontal: 16, color: colors.muted },
});
