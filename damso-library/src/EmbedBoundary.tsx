import { Component, type ReactNode } from 'react';

export function notifyEmbed(type: 'damso-room-ready' | 'damso-room-error' | 'damso-open-album' | 'damso-open-library') {
  const message = JSON.stringify({ type });
  const native = (window as Window & { ReactNativeWebView?: { postMessage: (value: string) => void } }).ReactNativeWebView;
  native?.postMessage(message);
  if (window.parent !== window && document.referrer) {
    window.parent.postMessage(message, new URL(document.referrer).origin);
  }
}

export class EmbedBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { notifyEmbed('damso-room-error'); }
  render() {
    return this.state.failed ? <p role="alert">3D 서재를 불러오지 못했어요. 2D 서재에서 다시 시도해주세요.</p> : this.props.children;
  }
}
