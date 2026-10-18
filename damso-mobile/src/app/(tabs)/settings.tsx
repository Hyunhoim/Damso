import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../AppState';
import { Copy, Header, Icon } from '../../components/Ui';
import { names } from '../../data/stories';
import { colors, fonts } from '../../theme';

export default function Settings() {
  const { role, setRole, textScale, setTextScale } = useApp();
  return <SafeAreaView edges={['top']} style={s.screen}><Header /><ScrollView contentContainerStyle={s.content}>
    <Copy accessibilityRole="header" style={s.title}>설정</Copy><Copy style={s.description}>나에게 편한 담소로 맞춰보세요.</Copy>
    <View style={s.profile}><View style={s.avatar}><Copy style={s.initial}>{names[role].slice(0, 1)}</Copy></View><View><Copy style={s.name}>{names[role]}님</Copy><Copy style={s.caption}>{role === 'parent' ? '부모' : '자녀'} 화면 미리보기</Copy></View></View>
    <View style={s.section}><Copy style={s.sectionTitle}>글자 크기</Copy><Copy style={s.caption}>편하게 읽을 수 있는 크기를 골라주세요.</Copy><View style={s.options}>{([1, 1.12, 1.24] as const).map((value, i) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: textScale === value }} onPress={() => setTextScale(value)} style={[s.sizeOption, textScale === value && s.selected]}><Copy style={[s.sizeLabel, textScale === value && { color: colors.green }]}>{['기본', '크게', '더 크게'][i]}</Copy></Pressable>)}</View><Copy style={s.reading}>오늘은 어떤 이야기를 나눌까요?</Copy></View>
    <View style={s.section}><Copy style={s.sectionTitle}>부모·자녀 화면</Copy><Copy style={s.caption}>역할에 맞는 질문을 확인해보세요.</Copy>{(['parent', 'child'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: role === value }} onPress={() => setRole(value)} style={s.roleRow}><View><Copy style={s.roleTitle}>{value === 'parent' ? '부모로 보기' : '자녀로 보기'}</Copy><Copy style={s.caption}>{names[value]}님의 오늘의 질문</Copy></View>{role === value ? <Icon name="check" /> : <View style={s.radio} />}</Pressable>)}</View>
    <View style={s.about}><Copy style={s.sectionTitle}>담소</Copy><Copy style={s.caption}>서로의 하루를, 조금 더 가까이.</Copy><Copy style={s.version}>버전 0.1.0 · 프론트엔드 미리보기</Copy></View>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, content: { paddingHorizontal: 26, paddingTop: 18, paddingBottom: 36 }, title: { fontFamily: fonts.heavy, fontSize: 32, lineHeight: 48 }, description: { color: colors.muted, fontSize: 17, lineHeight: 28, marginTop: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 30, borderBottomWidth: 1, borderBottomColor: colors.line }, avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' }, initial: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 36, color: colors.green }, name: { fontFamily: fonts.bold, fontSize: 23, lineHeight: 36 }, caption: { color: colors.muted, fontSize: 15, lineHeight: 25 },
  section: { paddingVertical: 28, borderBottomWidth: 1, borderBottomColor: colors.line }, sectionTitle: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 33, marginBottom: 8 }, options: { flexDirection: 'row', gap: 10, marginTop: 20 }, sizeOption: { flex: 1, minHeight: 56, borderWidth: 1, borderColor: colors.line, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 5 }, selected: { borderColor: colors.green, backgroundColor: colors.sage }, sizeLabel: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 27 }, reading: { fontSize: 18, lineHeight: 30, marginTop: 20, color: colors.green },
  roleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 18, minHeight: 86 }, roleTitle: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 30 }, radio: { width: 22, height: 22, borderRadius: 11, borderColor: colors.line, borderWidth: 1 }, about: { paddingTop: 30 }, version: { color: colors.muted, fontSize: 13, lineHeight: 22, marginTop: 14 },
});
