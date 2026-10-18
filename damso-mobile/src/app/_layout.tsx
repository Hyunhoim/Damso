import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../AppState';
import { colors } from '../theme';

export default function RootLayout() {
  const { width } = useWindowDimensions();
  const [loaded, error] = useFonts({
    'Paperlogy-Regular': require('../../assets/fonts/Paperlogy-4Regular.ttf'),
    'Paperlogy-Bold': require('../../assets/fonts/Paperlogy-7Bold.ttf'),
    'Paperlogy-ExtraBold': require('../../assets/fonts/Paperlogy-8ExtraBold.ttf'),
    FlowerRoad: require('../../assets/fonts/SangSangFlowerRoad.ttf'),
  });
  const desktop = Platform.OS === 'web' && width >= 768;
  useEffect(() => { if (Platform.OS === 'web') document.documentElement.lang = 'ko'; }, []);
  if (!loaded && !error) return <View style={s.loading}><ActivityIndicator color={colors.green} size="large" /></View>;
  return <SafeAreaProvider><AppProvider><StatusBar style="dark" /><View style={[s.outer, desktop && s.desktop]}><View style={[s.app, desktop && s.frame]}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: 'none' }} /></View></View></AppProvider></SafeAreaProvider>;
}
const s = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  outer: { flex: 1, alignItems: 'center', backgroundColor: colors.paper }, desktop: { paddingVertical: 24 },
  app: { flex: 1, width: '100%', maxWidth: 440, backgroundColor: colors.surface, overflow: 'hidden' },
  frame: { borderRadius: 28, borderWidth: 1, borderColor: colors.line },
});
