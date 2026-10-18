import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseRoomMessage } from '../data/stories';

export type RoomSurfaceProps = { onReady: () => void; onError: () => void };
export default function RoomSurface({ onReady, onError }: RoomSurfaceProps) {
  // Emulator default; physical devices need EXPO_PUBLIC_LIBRARY_3D_URL pointing to the deployed viewer.
  const base = process.env.EXPO_PUBLIC_LIBRARY_3D_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:5174/' : 'http://localhost:5174/');
  const uri = new URL(base); uri.searchParams.set('embedded', '1');
  return <WebView source={{ uri: uri.href }} style={{ flex: 1, backgroundColor: '#ece8e1' }} originWhitelist={[uri.origin]} onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url.startsWith(`${uri.origin}/`)} onError={onError} onHttpError={onError} onMessage={event => { const status = parseRoomMessage(event.nativeEvent.data); if (status === 'ready') onReady(); if (status === 'error') onError(); }} javaScriptEnabled domStorageEnabled={false} />;
}
