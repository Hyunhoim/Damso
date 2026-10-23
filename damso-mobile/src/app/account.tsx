import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBackend } from '../BackendState';
import { useApp } from '../AppState';
import { Button, Copy, Field, Icon } from '../components/Ui';
import { colors, fonts } from '../theme';

export default function Account() {
  const { mode: initial } = useLocalSearchParams<{ mode?: string }>();
  const backend = useBackend(); const app = useApp();
  const [signup, setSignup] = useState(initial === 'signup'); const [name, setName] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit() {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || password.length < 8) { setError('이메일 형식과 8자 이상의 비밀번호를 확인해주세요.'); return; }
    if (signup && (!name.trim() || password !== confirm)) { setError('이름과 비밀번호 확인을 다시 살펴봐주세요.'); return; }
    setBusy(true); setError('');
    try {
      if (signup) await backend.signup(email.trim(), password, name.trim(), app.role);
      else await backend.connect(email.trim(), password);
      setPassword(''); setConfirm('');
      router.replace('/family');
    } catch (e) { setError(e instanceof Error ? e.message : '로그인하지 못했어요. 다시 시도해주세요.'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={s.screen}><Pressable accessibilityRole="button" accessibilityLabel="첫 설정으로 돌아가기" disabled={busy} onPress={() => router.replace('/onboarding')} style={s.back}><Icon name="back" /><Copy>첫 설정</Copy></Pressable><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Copy style={s.brand}>담소</Copy><Copy accessibilityRole="header" style={s.title}>{signup ? '이야기를 담을\n계정을 만들어요.' : '다시 만나 반가워요.'}</Copy>
    <Copy style={s.hint}>{signup ? `${app.role === 'parent' ? '부모' : '자녀'} 계정으로 시작해요. 가입 후 가족을 연결할 수 있어요.` : '사용하던 이메일과 비밀번호를 입력해주세요.'}</Copy>
    {signup && <Field label="이름" value={name} onChangeText={setName} maxLength={50} editable={!busy} autoComplete="name" />}
    <Field label="이메일" value={email} onChangeText={setEmail} maxLength={255} editable={!busy} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
    <Field label="비밀번호" value={password} onChangeText={setPassword} maxLength={128} editable={!busy} secureTextEntry autoComplete={signup ? 'new-password' : 'current-password'} placeholder="8자 이상 입력해주세요" />
    {signup && <Field label="비밀번호 확인" value={confirm} onChangeText={setConfirm} maxLength={128} editable={!busy} secureTextEntry autoComplete="new-password" />}
    {!!error && <Copy accessibilityRole="alert" style={s.error}>{error}</Copy>}
    <Button label={busy ? '잠시만 기다려주세요…' : signup ? '가입하고 가족 연결하기' : '로그인하기'} disabled={busy || !email || !password || (signup && (!name || !confirm))} onPress={() => { void submit(); }} />
    <Button secondary label={signup ? '이미 계정이 있어요' : '처음이에요 · 계정 만들기'} disabled={busy} onPress={() => { setSignup(!signup); setError(''); setPassword(''); setConfirm(''); }} />
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.surface }, back: { minHeight: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8 }, content: { padding: 28, gap: 22 }, brand: { fontFamily: fonts.brand, fontSize: 44, color: colors.green }, title: { fontFamily: fonts.heavy, fontSize: 30, lineHeight: 45 }, hint: { color: colors.muted, fontSize: 17, lineHeight: 28 }, error: { color: colors.error, fontSize: 16 } });
