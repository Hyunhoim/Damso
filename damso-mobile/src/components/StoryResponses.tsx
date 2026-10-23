import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useBackend } from '../BackendState';
import { Button, Copy, Field } from './Ui';
import { colors, fonts } from '../theme';

type Comment = { id: string; author_id: string; author_name: string | null; text: string; created_at: string };
type Responses = { comments: Comment[]; reactions: string[] };
export function StoryResponses({ answerId, own }: { answerId: string; own: boolean }) {
  const backend = useBackend(); const [data, setData] = useState<Responses | null>(null); const [text, setText] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; setData(null); setError(''); if (backend.connected) void backend.api<Responses>(`/library/${answerId}`).then(value => { if (active) setData(value); }).catch(() => { if (active) setError('가족의 반응을 불러오지 못했어요.'); }); return () => { active = false; }; }, [answerId, backend.profile?.id, backend.api, attempt]);
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setError('');
    try { await action(); setData(await backend.api<Responses>(`/library/${answerId}`)); }
    catch (e) { setError(e instanceof Error ? e.message : '반응을 저장하지 못했어요.'); }
    finally { setBusy(false); }
  }
  if (!backend.connected) return null;
  const reacted = data?.reactions.includes(backend.profile!.id);
  const commentAuthor = (comment: Comment) => comment.author_id === backend.profile?.id ? '나' : backend.family?.members.find(member => member.id === comment.author_id)?.role === 'parent' ? backend.family?.settings?.parent_label || '부모님' : comment.author_name || '가족';
  return <View style={s.section}><Copy accessibilityRole="header" style={s.title}>이야기를 나눠요</Copy>
    {!data && !error && <Copy style={s.hint}>가족의 반응을 불러오는 중이에요.</Copy>}
    {data && <>
      <Button secondary label={`${reacted ? '공감 취소' : '공감하기'} · ${data.reactions.length}`} disabled={busy} onPress={() => { void run(async () => { await backend.api(`/library/${answerId}/reaction`, undefined, reacted ? 'DELETE' : 'PUT'); }); }} />
      {!data.comments.length && <Copy style={s.hint}>짧은 한마디로 이야기를 이어보세요.</Copy>}
      {data.comments.map(comment => <View key={comment.id} style={s.comment}><Copy style={s.author}>{commentAuthor(comment)}</Copy><Copy>{comment.text}</Copy><Copy style={s.hint}>{new Date(comment.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</Copy>{comment.author_id === backend.profile?.id && <Button secondary label="내 댓글 삭제" disabled={busy} onPress={() => { void run(async () => { await backend.api(`/library/${answerId}/comments/${comment.id}`, undefined, 'DELETE'); }); }} />}</View>)}
      <Field label="가족에게 남길 한마디" value={text} onChangeText={setText} multiline maxLength={2000} editable={!busy} />
      <Button label={busy ? '저장 중…' : '댓글 남기기'} disabled={busy || !text.trim()} onPress={() => { void run(async () => { await backend.api(`/library/${answerId}/comments`, { text: text.trim() }); setText(''); }); }} />
      {own && (!deleting ? <Button secondary label="내 이야기 삭제 안내" disabled={busy} onPress={() => setDeleting(true)} /> : <><Copy style={s.hint}>이 이야기와 연결된 댓글·사진이 삭제돼요. 삭제한 이야기는 되돌릴 수 없어요.</Copy><Button label="확인 · 이야기 삭제하기" disabled={busy} onPress={() => { if (busy) return; setBusy(true); void backend.api(`/answers/${answerId}`, undefined, 'DELETE').then(async () => { await backend.refresh(); router.replace('/library'); }).catch(e => { setError(e instanceof Error ? e.message : '이야기를 삭제하지 못했어요.'); setBusy(false); }); }} /><Button secondary label="취소" disabled={busy} onPress={() => setDeleting(false)} /></>)}
    </>}
    {!!error && <><Copy accessibilityRole="alert" style={s.error}>{error}</Copy><Button secondary label="반응 다시 불러오기" disabled={busy} onPress={() => setAttempt(value => value + 1)} /></>}
  </View>;
}
const s = StyleSheet.create({ section: { paddingVertical: 24, borderTopWidth: 1, borderTopColor: colors.line, gap: 18 }, title: { fontFamily: fonts.bold, fontSize: 21 }, hint: { color: colors.muted, fontSize: 14, lineHeight: 24 }, comment: { paddingVertical: 18, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line }, author: { fontFamily: fonts.bold, fontSize: 16, color: colors.green }, error: { color: colors.error } });
