import { Pressable, StyleSheet, View } from 'react-native';
import { Copy, Icon } from './Ui';
import { summaryStyles, type SummaryStyle } from '../data/preferences';
import { colors, fonts } from '../theme';

export function SummaryStylePicker({ value, onChange, disabled = false }: { value: SummaryStyle; onChange: (style: SummaryStyle) => void; disabled?: boolean }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel="이야기 요약 문체" style={s.list}>{summaryStyles.map(style => <Pressable key={style.id} accessibilityRole="radio" accessibilityLabel={`${style.title}, ${style.ending}`} accessibilityState={{ checked: value === style.id, disabled }} aria-checked={value === style.id} disabled={disabled} onPress={() => onChange(style.id)} style={({ pressed }) => [s.option, value === style.id && s.selected, pressed && { opacity: 0.8 }]}>
    <View style={s.heading}><View style={s.words}><Copy style={s.title}>{style.title}</Copy><Copy style={s.description}>{style.description}</Copy></View>{value === style.id ? <View style={s.check}><Icon name="check" size={18} color={colors.surface} /></View> : <View style={s.radio} />}</View>
    <Copy style={s.example}>{style.example.replace('. ', '.\n')}</Copy>
  </Pressable>)}</View>;
}
const s = StyleSheet.create({
  list: { gap: 14, marginTop: 22 }, option: { padding: 20, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }, selected: { borderColor: colors.green, backgroundColor: colors.sage },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14 }, words: { flex: 1 }, title: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 32 }, description: { fontSize: 14, lineHeight: 23, color: colors.muted, marginTop: 3 },
  example: { fontSize: 17, lineHeight: 29, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line }, radio: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: colors.line }, check: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green },
});
