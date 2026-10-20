import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useBackend } from '../BackendState';
import { useApp } from '../AppState';
import { Button, Copy } from './Ui';
import { colors, fonts } from '../theme';
export function ServerConnection() {
  const backend = useBackend(); const app = useApp();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function connect() { setBusy(true); setError(''); try { const user = await backend.connect(email.trim(), password); app.setRole(user.role); await app.savePreferences({ role: user.role, parentLabel: app.parentLabel, summaryStyle: user.summary_style, completed: true }); } catch (e) { setError(e instanceof Error ? e.message : '서버에 연결하지 못했어요.'); } finally { setPassword(''); setBusy(false); } }
  return <View style={s.section}><Copy accessibilityRole="header" style={s.title}>로그인</Copy>{backend.connected ? <><Copy>{backend.profile?.full_name}님의 계정으로 연결됐어요.</Copy><Copy style={s.note}>가족의 기록과 질문을 불러와요. 새로고침하면 다시 로그인해주세요.</Copy><Button secondary label="연결 종료" onPress={backend.disconnect} /></> : <><Copy style={s.note}>가족 연결을 마친 계정으로 로그인하면 이야기를 남기고 다음 날 질문을 예약할 수 있어요.</Copy><TextInput accessibilityLabel="계정 이메일" autoCapitalize="none" keyboardType="email-address" placeholder="이메일" value={email} onChangeText={setEmail} style={s.input} /><TextInput accessibilityLabel="계정 비밀번호" secureTextEntry placeholder="비밀번호" value={password} onChangeText={setPassword} style={s.input} /><Button label={busy ? '연결 중…' : '계정 연결하기'} disabled={busy || !email || !password} onPress={() => { void connect(); }} /></>}{!!error && <Copy accessibilityRole="alert" style={s.error}>{error}</Copy>}</View>;
}
const s = StyleSheet.create({ section: { paddingVertical: 28, gap: 16, borderBottomWidth: 1, borderColor: colors.line }, title: { fontFamily: fonts.bold, fontSize: 21 }, note: { fontSize: 15, lineHeight: 25, color: colors.muted }, input: { minHeight: 56, padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 10, fontFamily: fonts.regular, fontSize: 17, color: colors.ink }, error: { color: colors.error, fontSize: 15 } });
