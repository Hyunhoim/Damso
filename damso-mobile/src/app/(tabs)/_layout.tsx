import { ActivityIndicator, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../components/Ui';
import { colors, fonts } from '../../theme';
import { useApp } from '../../AppState';
import { useBackend } from '../../BackendState';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const backend = useBackend();
  const { textScale, preferencesReady, onboardingComplete } = useApp();
  if (!preferencesReady || !backend.ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.green} accessibilityLabel="설정을 불러오는 중" /></View>;
  if (!backend.connected && (!backend.preview || !onboardingComplete)) return <Redirect href="/onboarding" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.muted, tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 15 * textScale, marginTop: 6 }, tabBarStyle: { height: 86 + insets.bottom, paddingTop: 12, paddingBottom: 16 + insets.bottom, backgroundColor: colors.surface, borderTopColor: colors.line }, sceneStyle: { backgroundColor: colors.surface } }}>
    <Tabs.Screen name="index" options={{ title: '오늘의 질문', tabBarIcon: ({ color }) => <Icon name="home" color={color} /> }} />
    <Tabs.Screen name="library" options={{ title: '기억의 서재', tabBarIcon: ({ color }) => <Icon name="book" color={color} /> }} />
    <Tabs.Screen name="settings" options={{ title: '설정', tabBarIcon: ({ color }) => <Icon name="settings" color={color} /> }} />
  </Tabs>;
}
