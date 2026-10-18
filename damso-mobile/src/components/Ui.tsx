import { Pressable, StyleSheet, Text, View, type TextProps, type StyleProp, type ViewStyle, type ColorValue } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors, fonts } from '../theme';
import { useApp } from '../AppState';

const paths = {
  home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3V10Z',
  book: 'M3 4h7a3 3 0 0 1 2 1 3 3 0 0 1 2-1h7v16h-7a3 3 0 0 0-2 1 3 3 0 0 0-2-1H3V4Zm9 1v16',
  mic: 'M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3Zm-7-4v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8',
  settings: 'M9.5 3h5l.6 2.6 2 .9 2.3-.8 2.5 4.3-1.9 1.8v2.4l1.9 1.8-2.5 4.3-2.3-.8-2 .9-.6 2.6h-5l-.6-2.6-2-.9-2.3.8L2.1 16 4 14.2v-2.4L2.1 10l2.5-4.3 2.3.8 2-.9.6-2.6Z',
  cube: 'M12 3 3 8v9l9 5 9-5V8l-9-5Zm0 10L3 8m9 5 9-5m-9 5v9M7.5 5.5l9 5',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'm14 6-6 6 6 6',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
};
export type IconName = keyof typeof paths;
export function Icon({ name, size = 26, color = colors.green }: { name: IconName; size?: number; color?: ColorValue }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}><Path d={paths[name]} />{name === 'settings' && <Circle cx="12" cy="12.5" r="3" />}</Svg>;
}
export function Copy({ style, ...props }: TextProps) {
  const { textScale } = useApp();
  const flat = StyleSheet.flatten(style) || {};
  return <Text {...props} style={[styles.copy, style, { fontSize: (flat.fontSize || 18) * textScale, lineHeight: (flat.lineHeight || 29) * textScale }]} />;
}
export function Header({ companion }: { companion?: string }) {
  return <View style={styles.header}><Copy style={styles.brand}>담소</Copy><Copy style={[styles.date, companion && { color: colors.green }]}>{companion ? `${companion}님과 함께` : new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</Copy></View>;
}
export function Button({ label, onPress, secondary = false, disabled = false, style }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }, style]}><Copy style={[styles.buttonText, secondary && { color: colors.green }]}>{label}</Copy></Pressable>;
}
const styles = StyleSheet.create({
  copy: { color: colors.ink, fontFamily: fonts.regular },
  header: { minHeight: 78, paddingHorizontal: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { fontFamily: fonts.brand, fontSize: 42, lineHeight: 52 }, date: { fontSize: 14, lineHeight: 24, color: colors.muted },
  button: { minHeight: 60, justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: colors.green },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  buttonText: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 28, color: colors.surface, textAlign: 'center' },
});
