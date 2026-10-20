import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useBackend } from '../BackendState';
import { Button, Copy } from './Ui';
import { colors, fonts } from '../theme';
import { audioTime } from '../data/audio';

type Original = { text: string | null; kind: 'text' | 'transcript'; audio_url: string | null; has_audio: boolean; share_original: boolean; share_audio: boolean };
type Source = { uri: string; headers?: Record<string, string> };

function OriginalAudio({ audioId }: { audioId: string }) {
  const [attempt, setAttempt] = useState(0);
  return <OriginalAudioPlayer key={attempt} audioId={audioId} onRetry={() => setAttempt(value => value + 1)} />;
}

function OriginalAudioPlayer({ audioId, onRetry }: { audioId: string; onRetry: () => void }) {
  const backend = useBackend();
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState('');
  const player = useAudioPlayer(source, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    let active = true; let blob = '';
    setSource(null); setError('');
    void backend.audioSource(audioId).then(value => {
      if (Platform.OS === 'web') blob = value.uri;
      if (active) setSource(value);
      else if (blob) URL.revokeObjectURL(blob);
    }).catch(() => { if (active) setError('원음을 불러오지 못했어요. 다시 시도해주세요.'); });
    return () => { active = false; if (blob) URL.revokeObjectURL(blob); };
  }, [audioId, backend.audioSource]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') player.pause(); });
    return () => subscription.remove();
  }, [player]);
  useEffect(() => {
    if (!source || status.isLoaded || status.error) return;
    const timer = setTimeout(() => setError('원음을 불러오지 못했어요. 다시 시도해주세요.'), 25000);
    return () => clearTimeout(timer);
  }, [source, status.isLoaded, status.error]);
  async function toggle() {
    try {
      setError('');
      if (status.playing) { player.pause(); return; }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) await player.seekTo(0);
      player.play();
    } catch { setError('원음을 재생하지 못했어요. 다시 시도해주세요.'); }
  }
  const failed = !!error || !!status.error;
  return <View style={s.audio}>
    <Copy style={s.hint}>녹음한 원래 목소리예요.</Copy>
    <Copy accessibilityLiveRegion="none" style={s.time}>{audioTime(status.currentTime)} / {audioTime(status.duration)}</Copy>
    {failed ? <><Copy accessibilityRole="alert" style={s.error}>{error || '원음을 재생하지 못했어요.'}</Copy><Button secondary label="원음 다시 불러오기" onPress={onRetry} /></> : <Button secondary label={!status.isLoaded ? '원음을 불러오는 중…' : status.playing ? '원음 일시정지' : '원음 듣기'} disabled={!status.isLoaded} onPress={() => { void toggle(); }} />}
  </View>;
}

export function StoryOriginal({ answerId }: { answerId: string }) {
  const backend = useBackend();
  const [own, setOwn] = useState(false);
  const [original, setOriginal] = useState<Original | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setOriginal(null); setOwn(false); setOpen(false); setError('');
    if (backend.connected) void backend.api<{ original: Original; author_id: string }>(`/library/${answerId}`).then(result => { if (active) { setOriginal(result.original); setOwn(result.author_id === backend.profile?.id); } }).catch(() => { if (active) setError('원문을 불러오지 못했어요. 다시 시도해주세요.'); });
    return () => { active = false; };
  }, [answerId, backend.profile?.id, backend.connected, backend.api, attempt]);
  async function share(field: 'share_original' | 'share_audio', value: boolean) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await backend.api(`/answers/${answerId}/sharing`, { [field]: value }, 'PATCH');
      const result = await backend.api<{ original: Original }>(`/library/${answerId}`);
      setOriginal(result.original);
    } catch (e) { setError(e instanceof Error ? e.message : '공유 설정을 저장하지 못했어요.'); }
    finally { setBusy(false); }
  }
  if (!backend.connected) return null;
  const audioId = original?.audio_url?.match(/^\/api\/v1\/audio\/([0-9a-f-]{36})\/content$/i)?.[1];
  return <View style={s.section}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={open ? '원문과 원음 접기' : '원문과 원음 보기'} onPress={() => setOpen(value => !value)} style={s.heading}>
      <Copy style={s.headingText}>원문과 원음</Copy><Copy style={s.toggle}>{open ? '접기 −' : '보기 ＋'}</Copy>
    </Pressable>
    {open && <View style={s.inner}>
      {!original && !error && <Copy style={s.hint}>원문을 불러오는 중이에요.</Copy>}
      {original && <>
        <Copy style={s.label}>{original.kind === 'transcript' ? '말씀하신 원문' : '직접 남긴 원문'}</Copy>
        <Copy selectable style={s.original}>{original.text || (own || original.share_original ? '남겨진 원문 텍스트가 없어요.' : '작성자가 원문 텍스트를 공유하지 않았어요.')}</Copy>
        {original.kind === 'transcript' && original.text && <Copy style={s.hint}>음성을 글로 옮긴 내용이라 실제 말씀과 다를 수 있어요.</Copy>}
        {audioId ? <OriginalAudio key={`${backend.profile?.id}:${audioId}`} audioId={audioId} /> : <Copy style={s.hint}>{original.has_audio ? '작성자가 원음을 공유하지 않았어요.' : '글로 남긴 이야기라 녹음된 원음이 없어요.'}</Copy>}
        {own && <View style={s.sharing}><Copy style={s.hint}>원문과 원음은 선택한 항목만 가족과 공유해요.</Copy>
          <View style={s.switchRow}><Copy style={s.switchLabel}>원문 텍스트 공유</Copy><Switch accessibilityLabel="가족에게 원문 텍스트 공유" disabled={busy} value={original.share_original} onValueChange={value => { void share('share_original', value); }} trackColor={{ true: colors.green }} /></View>
          {original.has_audio && <View style={s.switchRow}><Copy style={s.switchLabel}>원음 공유</Copy><Switch accessibilityLabel="가족에게 원음 공유" disabled={busy} value={original.share_audio} onValueChange={value => { void share('share_audio', value); }} trackColor={{ true: colors.green }} /></View>}
        </View>}
      </>}
      {!!error && <><Copy accessibilityRole="alert" style={s.error}>{error}</Copy>{!original && <Button secondary label="원문 다시 불러오기" onPress={() => setAttempt(value => value + 1)} />}</>}
    </View>}
  </View>;
}
const s = StyleSheet.create({
  section: { borderTopColor: colors.line, borderTopWidth: 1 }, heading: { minHeight: 62, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  headingText: { fontFamily: fonts.bold, fontSize: 18 }, toggle: { fontSize: 15, color: colors.green }, inner: { gap: 16, paddingBottom: 24 },
  label: { fontFamily: fonts.bold, fontSize: 17 }, original: { fontSize: 18, lineHeight: 31 }, hint: { fontSize: 15, lineHeight: 25, color: colors.muted }, audio: { gap: 10, paddingVertical: 12 },
  time: { fontSize: 15, lineHeight: 24, color: colors.green }, sharing: { gap: 12, borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 18 }, switchRow: { flexDirection: 'row', gap: 16, alignItems: 'center', minHeight: 48 }, switchLabel: { flex: 1, fontSize: 16 }, error: { color: colors.error, fontSize: 16 },
});
