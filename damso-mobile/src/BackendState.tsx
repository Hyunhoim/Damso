import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { Role, Story } from './data/stories';

export type OrganizationStatus = 'ready' | 'no_story' | 'declined';
export type Draft = { id: string; title: string | null; organization_status: OrganizationStatus | null; summary_draft: string | null; transcript: string | null; original_text: string | null; follow_up_question: string | null; audio_id: string | null };
export type ServerQuestion = { id: string; text: string; answer_id: string | null; answer_status: string | null; kind?: 'ai' | 'family'; source_title?: string; source_text?: string };
type Questions = { daily: ServerQuestion; follow_up: ServerQuestion | null; follow_ups: ServerQuestion[]; custom: ServerQuestion[]; daily_limit: number };
type Profile = { id: string; role: Role; full_name: string; summary_style: 'auto' | 'diary' };
type Backend = { audioSource: (id: string) => Promise<{ uri: string; headers?: Record<string, string> }>; readPhoto: (id: string) => Promise<string>; connected: boolean; profile: Profile | null; questions: Questions | null; stories: Story[]; api: <T>(path: string, body?: unknown, method?: string) => Promise<T>; refresh: () => Promise<void>; connect: (email: string, password: string) => Promise<Profile>; disconnect: () => void };
const Context = createContext<Backend | null>(null);
const base = (process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '') + '/api/v1';
export function BackendProvider({ children }: { children: ReactNode }) {
  const token = useRef(''); const generation = useRef(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [questions, setQuestions] = useState<Questions | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const api = useCallback(async <T,>(path: string, body?: unknown, method = 'POST'): Promise<T> => {
    const requestToken = token.current;
    const form = body instanceof FormData;
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : method, headers: { ...(token.current ? { Authorization: `Bearer ${token.current}` } : {}), ...(!form && body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : form ? body : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
    const result = await response.json();
    if (requestToken !== token.current) throw new Error('계정 연결이 변경됐어요. 다시 확인해주세요.');
    if (!response.ok) {
      if (response.status === 401) throw new Error('로그인 정보를 확인해주세요. 만료됐다면 다시 연결해주세요.');
      if (path.endsWith('/photos') && response.status === 413) throw new Error('10MB 이하 사진을 선택해주세요.');
      if (path.endsWith('/photos') && response.status === 422) throw new Error('JPEG·PNG·WebP 사진으로 다시 선택해주세요.');
      if (response.status === 409 && path.endsWith('/follow-up')) throw new Error('내일의 추가 질문이 이미 예약돼 있어요. 하루에 한 이야기만 요청할 수 있어요.');
      throw new Error(typeof result.detail === 'string' ? result.detail : '요청을 처리하지 못했어요. 다시 시도해주세요.');
    }
    return result as T;
  }, []);
  const audioSource = useCallback(async (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !token.current) throw new Error('원음을 확인하려면 다시 로그인해주세요.');
    const requestToken = token.current;
    const uri = `${base}/audio/${id}/content`;
    const headers = { Authorization: `Bearer ${requestToken}` };
    if (Platform.OS !== 'web') return { uri, headers };
    // The web audio element cannot attach Bearer headers; use an authenticated, temporary blob.
    const response = await fetch(uri, { headers, cache: 'no-store', signal: AbortSignal.timeout(25000) });
    if (!response.ok || token.current !== requestToken) throw new Error('원음을 불러오지 못했어요. 공유 상태와 계정 연결을 확인해주세요.');
    const blob = await response.blob();
    if (token.current !== requestToken) throw new Error('계정 연결이 변경됐어요.');
    return { uri: URL.createObjectURL(blob) };
  }, []);
  const readPhoto = useCallback(async (id: string): Promise<string> => {
    const requestToken = token.current;
    const response = await fetch(`${base}/photos/${encodeURIComponent(id)}/content`, { headers: { Authorization: `Bearer ${requestToken}` }, signal: AbortSignal.timeout(25000) });
    if (!response.ok || token.current !== requestToken) throw new Error('사진을 불러오지 못했어요. 계정 연결을 확인해주세요.');
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => token.current === requestToken ? resolve(String(reader.result)) : reject(new Error('계정 연결이 변경됐어요.'));
      reader.onerror = () => reject(new Error('사진을 읽지 못했어요.'));
      reader.readAsDataURL(blob);
    });
  }, []);
  const refresh = useCallback(async () => {
    const version = generation.current;
    const [nextQuestions, library] = await Promise.all([api<Questions>('/questions/today'), api<{ data: Array<{ id: string; author_role: Role; story_date: string; title: string; question: string; text: string }> }>('/library?limit=100')]);
    if (generation.current !== version) return;
    setQuestions(nextQuestions);
    setStories(library.data.map(item => ({ id: item.id, author: item.author_role, date: item.story_date, title: item.title, question: item.question, text: item.text || '', sample: false })));
  }, [api]);
  useEffect(() => {
    if (!profile) return;
    const koreanDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    let day = koreanDay();
    const refreshIfNewDay = () => { if (koreanDay() !== day) void refresh().then(() => { day = koreanDay(); }).catch(() => {}); };
    const timer = setInterval(refreshIfNewDay, 60000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh().then(() => { day = koreanDay(); }).catch(() => {}); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [profile?.id, refresh]);
  async function connect(email: string, password: string) {
    const form = new URLSearchParams({ username: email, password });
    const response = await fetch(base + '/login/access-token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('이메일과 비밀번호를 확인해주세요.');
    const result = await response.json();
    generation.current += 1; token.current = result.access_token;
    setStories([]); setQuestions(null);
    const user = await api<Profile>('/profile');
    setProfile(user);
    await refresh();
    return user;
  }
  function disconnect() { generation.current += 1; token.current = ''; setProfile(null); setQuestions(null); setStories([]); }
  return <Context.Provider value={{ audioSource, readPhoto, connected: !!profile, profile, questions, stories, api, refresh, connect, disconnect }}>{children}</Context.Provider>;
}
export function useBackend() { const value = useContext(Context); if (!value) throw new Error('BackendProvider is required'); return value; }
