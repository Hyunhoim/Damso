import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useBackend } from '../BackendState';
import { Button, Copy } from './Ui';
import { colors } from '../theme';

export type Photo = { id: string; answer_id: string; width: number; height: number };

export function PrivatePhoto({ photo, full = false }: { photo: Photo; full?: boolean }) {
  const backend = useBackend(); const [uri, setUri] = useState(''); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; setUri(''); setFailed(false);
    void backend.readPhoto(photo.id).then(value => { if (active) setUri(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [photo.id, backend.profile?.id, backend.readPhoto]);
  return <View style={full ? styles.fullImage : styles.photo}>{uri ? <Image accessibilityLabel="이야기에 남긴 사진" source={{ uri }} style={StyleSheet.absoluteFill} resizeMode={full ? 'contain' : 'cover'} /> : failed ? <Copy>사진을 불러오지 못했어요.</Copy> : <ActivityIndicator color={colors.green} accessibilityLabel="사진을 불러오는 중" />}</View>;
}

export function PhotoViewer({ photo, onClose }: { photo: Photo | null; onClose: () => void }) {
  return <Modal visible={!!photo} transparent animationType="fade" onRequestClose={onClose}><View style={styles.viewer}>{photo && <PrivatePhoto photo={photo} full />}<Button label="사진 닫기" onPress={onClose} /></View></Modal>;
}

export function StoryPhotos({ answerId, canUpload }: { answerId: string; canUpload: boolean }) {
  const backend = useBackend(); const [photos, setPhotos] = useState<Photo[]>([]); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [selected, setSelected] = useState<Photo | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  useEffect(() => {
    let active = true; setPhotos([]); setSelected(null); setDeleteId(null); setError('');
    if (backend.connected) void backend.api<{data: Photo[]}>(`/library/${answerId}/photos`).then(result => { if (active) setPhotos(result.data); }).catch(() => { if (active) setError('사진을 불러오지 못했어요. 다시 열어주세요.'); });
    return () => { active = false; };
  }, [answerId, backend.connected, backend.profile?.id, backend.api]);
  async function upload() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) throw new Error('10MB 이하 사진을 선택해주세요.');
      const form = new FormData();
      if (Platform.OS === 'web') form.append('file', asset.file || await (await fetch(asset.uri)).blob(), asset.fileName || 'photo.jpg');
      else form.append('file', { uri: asset.uri, name: asset.fileName || 'photo.jpg', type: asset.mimeType || 'image/jpeg' } as unknown as Blob);
      const photo = await backend.api<Photo>(`/library/${answerId}/photos`, form);
      setPhotos(items => [...items, photo]);
    } catch (e) { setError(e instanceof Error ? e.message : '사진을 등록하지 못했어요. JPEG·PNG·WebP 사진으로 다시 시도해주세요.'); }
    finally { setBusy(false); }
  }
  if (!backend.connected) return null;
  return <View style={styles.section}><Copy accessibilityRole="header">이야기와 함께 남긴 사진</Copy>
    {photos.length === 0 && <Copy style={styles.hint}>이날의 사진을 함께 보관할 수 있어요.</Copy>}
    <View style={styles.grid}>{photos.map(photo => <View key={photo.id} style={styles.cell}><Pressable accessibilityRole="button" accessibilityLabel="사진 크게 보기" onPress={() => setSelected(photo)}><PrivatePhoto photo={photo} /></Pressable>{canUpload && <Button secondary label="사진 삭제" disabled={busy} onPress={() => setDeleteId(photo.id)} />}</View>)}</View>
    {deleteId && <><Copy style={styles.hint}>선택한 사진을 이야기와 앨범에서 삭제할까요?</Copy><Button secondary label="확인 · 사진 삭제하기" disabled={busy} onPress={() => { setBusy(true); setError(''); void backend.api(`/photos/${deleteId}`, undefined, 'DELETE').then(() => { setPhotos(items => items.filter(item => item.id !== deleteId)); setSelected(null); setDeleteId(null); }).catch(e => setError(e instanceof Error ? e.message : '사진을 삭제하지 못했어요.')).finally(() => setBusy(false)); }} /><Button secondary label="취소" disabled={busy} onPress={() => setDeleteId(null)} /></>}
    {canUpload && <Button secondary label={busy ? '사진을 등록하고 있어요…' : '관련 사진 등록하기'} disabled={busy || photos.length >= 12} onPress={() => { void upload(); }} />}
    {!!error && <Copy accessibilityRole="alert" style={styles.error}>{error}</Copy>}
    <PhotoViewer photo={selected} onClose={() => setSelected(null)} />
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 14, paddingVertical: 24, borderTopWidth: 1, borderTopColor: colors.line }, hint: { fontSize: 16, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, cell: { width: '47%', minHeight: 120 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  fullImage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }, viewer: { flex: 1, padding: 24, paddingTop: 50, paddingBottom: 40, backgroundColor: colors.surface, gap: 20 },
  error: { color: colors.error, fontSize: 16 },
});
