import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useBackend } from '../BackendState';
import { Button, Copy, Field } from './Ui';
import { colors, fonts } from '../theme';
export function ServerConnection() {
  const backend = useBackend();
  const [name, setName] = useState(''); const [time, setTime] = useState('19:00');
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [deleting, setDeleting] = useState(false); const [confirmation, setConfirmation] = useState('');
  useEffect(() => { setName(backend.profile?.full_name || ''); setTime(backend.profile?.reminder_time?.slice(0, 5) || '19:00'); setDeleting(false); setConfirmation(''); setCurrentPassword(''); setNewPassword(''); setNotice(''); }, [backend.profile?.id]);
  async function run(action: () => Promise<void>, success = '') { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await action(); setNotice(success); } catch (e) { setError(e instanceof Error ? e.message : '변경하지 못했어요. 다시 시도해주세요.'); } finally { setBusy(false); } }
  return <View style={s.section}><Copy accessibilityRole="header" style={s.title}>내 계정</Copy>{backend.connected ? <>
    <Copy style={s.note}>{backend.profile?.email}</Copy>
    <Field label="이름" value={name} onChangeText={setName} maxLength={50} editable={!busy} />
    <Button secondary label="이름 저장하기" disabled={busy || !name.trim()} onPress={() => { void run(() => backend.updateProfile({ full_name: name.trim() }), '이름을 저장했어요.'); }} />
    <View style={s.row}><Copy style={s.label}>앱 안의 새 소식 받기</Copy><Switch accessibilityLabel="앱 내부 알림 받기" value={backend.profile?.notifications_enabled} disabled={busy} onValueChange={value => { void run(() => backend.updateProfile({ notifications_enabled: value }), '알림 설정을 저장했어요.'); }} trackColor={{ true: colors.green }} /></View>
    <Field label="알림 희망 시간 (한국 시간)" value={time} onChangeText={setTime} maxLength={5} editable={!busy} placeholder="19:00" />
    <Copy style={s.note}>시간을 저장해두어요. 휴대폰 푸시·예약 발송은 아직 준비 중이에요.</Copy>
    <Button secondary label="알림 시간 저장하기" disabled={busy || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)} onPress={() => { void run(() => backend.updateProfile({ reminder_time: time + ':00' }), '알림 희망 시간을 저장했어요.'); }} />
    <Button secondary label="새 소식 확인하기" disabled={busy} onPress={() => router.push('/notifications')} />
    <Copy style={s.title}>비밀번호 변경</Copy>
    <Field label="현재 비밀번호" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry maxLength={128} editable={!busy} />
    <Field label="새 비밀번호" value={newPassword} onChangeText={setNewPassword} secureTextEntry maxLength={128} editable={!busy} placeholder="8자 이상" />
    <Button secondary label="비밀번호 변경하고 다시 로그인" disabled={busy || currentPassword.length < 8 || newPassword.length < 8 || currentPassword === newPassword} onPress={() => { void run(async () => { await backend.api('/users/me/password', { current_password: currentPassword, new_password: newPassword }, 'PATCH'); setCurrentPassword(''); setNewPassword(''); await backend.clearSession(); router.replace('/account'); }); }} />
    <Button secondary label="로그아웃" disabled={busy} onPress={() => { void run(async () => { await backend.disconnect(); router.replace('/account'); }); }} />
    {!deleting ? <Button secondary label="계정 탈퇴 안내" disabled={busy} onPress={() => setDeleting(true)} /> : <View style={s.confirm}><Copy style={s.error}>탈퇴하면 내 이야기·원음·사진이 삭제되고 가족 연결이 해제돼요. 되돌릴 수 없어요.</Copy><Field label="탈퇴하려면 ‘탈퇴’를 입력해주세요" value={confirmation} onChangeText={setConfirmation} editable={!busy} /><Button label="확인 · 계정 영구 삭제" disabled={busy || confirmation !== '탈퇴'} onPress={() => { void run(async () => { await backend.api('/users/me', undefined, 'DELETE'); await backend.clearSession(); router.replace('/onboarding'); }); }} /><Button secondary label="취소" disabled={busy} onPress={() => { setDeleting(false); setConfirmation(''); }} /></View>}
  </> : <><Copy style={s.note}>로그인하면 가족의 기록과 설정을 이어서 사용할 수 있어요.</Copy><Button label="로그인하기" onPress={() => router.push('/account')} /><Button secondary label="계정 만들기" onPress={() => router.push('/onboarding')} /></>}
    {!!backend.error && <Copy accessibilityRole="alert" style={s.error}>{backend.error}</Copy>}{!!error && <Copy accessibilityRole="alert" style={s.error}>{error}</Copy>}{!!notice && <Copy accessibilityLiveRegion="polite" style={s.note}>{notice}</Copy>}
  </View>;
}
const s = StyleSheet.create({ section: { paddingVertical: 28, gap: 18, borderBottomWidth: 1, borderColor: colors.line }, title: { fontFamily: fonts.bold, fontSize: 21, marginTop: 8 }, note: { fontSize: 15, lineHeight: 25, color: colors.muted }, error: { color: colors.error, fontSize: 16, lineHeight: 27 }, row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 16 }, label: { flex: 1, fontSize: 17 }, confirm: { gap: 18 } });
