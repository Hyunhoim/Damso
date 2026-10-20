import { useEffect, useRef } from 'react';
import { parseRoomMessage } from '../data/stories';
import type { RoomSurfaceProps } from './RoomSurface';

export default function RoomSurface({ onReady, onError, onOpenAlbum, onOpenLibrary }: RoomSurfaceProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const hostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
  const uri = new URL(process.env.EXPO_PUBLIC_LIBRARY_3D_URL || `http://${hostname}:5174/`);
  uri.searchParams.set('embedded', '1');
  const origin = uri.origin;
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== origin || event.source !== iframe.current?.contentWindow) return;
      const status = parseRoomMessage(event.data);
      if (status === 'ready') onReady();
      if (status === 'error') onError();
      if (status === 'album') onOpenAlbum();
      if (status === 'library') onOpenLibrary();
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [origin, onReady, onError, onOpenAlbum, onOpenLibrary]);
  return <iframe ref={iframe} title="기억의 서재 3D 공간" src={uri.href} onError={onError} style={{ border: 0, width: '100%', height: '100%', display: 'block', flex: 1 }} />;
}
