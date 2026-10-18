import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Copy, Icon } from './Ui';
import { colors, fonts } from '../theme';

export function VoiceButton({ paused, onPress }: { paused: boolean; onPress: () => void }) {
  const breath = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    let mounted = true;
    const updateMotion = (enabled: boolean) => { if (mounted) setReduceMotion(enabled); };
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', updateMotion);
    const appSubscription = AppState.addEventListener('change', state => setActive(state === 'active'));
    AccessibilityInfo.isReduceMotionEnabled().then(updateMotion).catch(() => updateMotion(true));
    return () => { mounted = false; motionSubscription?.remove(); appSubscription.remove(); press.stopAnimation(); };
  }, [press]);
  useFocusEffect(useCallback(() => {
    breath.setValue(0);
    if (reduceMotion || paused || !active) return;
    const timing = { duration: 2100, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false };
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(breath, { ...timing, toValue: 1 }),
      Animated.timing(breath, { ...timing, toValue: 0 }),
    ]));
    animation.start();
    return () => { animation.stop(); breath.setValue(0); };
  }, [active, breath, paused, reduceMotion]));
  function pressTo(value: number) {
    if (reduceMotion) { press.setValue(value); return; }
    Animated.spring(press, { toValue: value, stiffness: 240, damping: 24, mass: 0.7, useNativeDriver: Platform.OS !== 'web', isInteraction: false }).start();
  }
  return <Pressable accessibilityRole="button" accessibilityLabel="목소리로 답하기" onPress={onPress} onPressIn={() => pressTo(0.96)} onPressOut={() => pressTo(1)} style={s.button}>
    <Animated.View testID="microphone-press" style={{ transform: [{ scale: press }] }}>
      <View style={s.circle}>
        <Animated.View testID="microphone-halo" pointerEvents="none" style={[s.halo, { opacity: reduceMotion || paused || !active ? 0 : breath.interpolate({ inputRange: [0, 1], outputRange: [0.16, 0.04] }), transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.16] }) }] }]} />
        <Animated.View testID="microphone-disc" style={[s.disc, { transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }] }]}><Icon name="mic" size={64} color={colors.surface} /></Animated.View>
      </View>
    </Animated.View>
    <Copy style={s.label}>눌러서 이야기하기</Copy>
  </Pressable>;
}
const s = StyleSheet.create({
  button: { alignItems: 'center', paddingVertical: 8, gap: 18 },
  circle: { width: 148, height: 148 },
  halo: { position: 'absolute', width: 148, height: 148, borderRadius: 74, backgroundColor: colors.green },
  disc: { width: 148, height: 148, borderRadius: 74, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.green, fontFamily: fonts.bold, fontSize: 20, lineHeight: 32 },
});
