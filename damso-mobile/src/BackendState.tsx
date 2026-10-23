import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from './api/client';
import { useApp } from './AppState';
import type { Role, Story } from './data/stories';
import type { ParentLabel } from './data/family';
import type { SummaryStyle } from './data/preferences';

export type OrganizationStatus = 'ready' | 'no_story' | 'declined';
export type Draft = { id: string; question_id: string; question?: string; title: string | null; organization_status: OrganizationStatus | null; summary_draft: string | null; transcript: string | null; original_text: string | null; follow_up_question: string | null; audio_id: string | null; skipped?: boolean; status?: string };
export type ServerQuestion = { id: string; text: string; answer_id: string | null; answer_status: string | null; kind?: 'ai' | 'family'; source?: string; source_title?: string; source_text?: string };
type Questions = { daily: ServerQuestion; follow_up: ServerQuestion | null; follow_ups: ServerQuestion[]; custom: ServerQuestion[]; daily_limit: number };
export type Profile = { id: string; role: Role; full_name: string; email: string; summary_style: SummaryStyle; text_scale: number; reminder_time: string; notifications_enabled: boolean };
export type Family = { status: 'unlinked' | 'waiting' | 'connected'; family_id: string | null; members: Array<{ id: string; full_name: string; role: Role }>; settings?: { parent_label: ParentLabel } };
type ServerStory = { id: string; author_id: string; author_role: Role; author_story_label: string; story_date: string; title: string; question: string; text: string };
type LibraryPage = { data: ServerStory[]; next_skip: number | null };
type Backend = {
  audioSource: (id: string) => Promise<{ uri: string; headers?: Record<string, string> }>; readPhoto: (id: string) => Promise<string>;
  ready: boolean; error: string; preview: boolean; startPreview: () => void; connected: boolean; profile: Profile | null; family: Family | null;
  questions: Questions | null; stories: Story[]; nextPage: number | null; loadMore: () => Promise<void>;
  api: <T>(path: string, body?: unknown, method?: string) => Promise<T>; refresh: () => Promise<void>;
  connect: (email: string, password: string) => Promise<Profile>; signup: (email: string, password: string, fullName: string, role: Role) => Promise<Profile>;
  updateProfile: (value: Partial<Pick<Profile, 'full_name' | 'summary_style' | 'text_scale' | 'reminder_time' | 'notifications_enabled'>>) => Promise<void>;
  updateFamilyLabel: (label: ParentLabel) => Promise<void>; disconnect: () => Promise<void>; clearSession: () => Promise<void>;
};
const Context = createContext<Backend | null>(null);
const base = (process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '') + '/api/v1';
const sessionKey = 'damso.refresh.v1';
const storage = {
  read: async () => Platform.OS === 'web' ? sessionStorage.getItem(sessionKey) : SecureStore.getItemAsync(sessionKey),
  write: async (value: string | null) => {
    if (Platform.OS === 'web') { if (value) sessionStorage.setItem(sessionKey, value); else sessionStorage.removeItem(sessionKey); }
    else if (value) await SecureStore.setItemAsync(sessionKey, value);
    else await SecureStore.deleteItemAsync(sessionKey);
  },
};
export const toStory = (item: ServerStory): Story => ({ id: item.id, author: item.author_role, authorId: item.author_id, heading: item.author_story_label, date: item.story_date, title: item.title, question: item.question, text: item.text || '', sample: false });

export function BackendProvider({ children }: { children: ReactNode }) {
  const app = useApp(); const appRef = useRef(app); appRef.current = app;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [ready, setReady] = useState(false); const [preview, setPreview] = useState(false); const [error, setError] = useState('');
  const [questions, setQuestions] = useState<Questions | null>(null);
  const [stories, setStories] = useState<Story[]>([]); const [nextPage, setNextPage] = useState<number | null>(null);
  const refreshVersion = useRef(0);
  const [client] = useState(() => createApiClient(base, storage, () => { refreshVersion.current += 1; setProfile(null); setFamily(null); setStories([]); setQuestions(null); setNextPage(null); setPreview(false); }));
  const api = client.api;
  const refresh = useCallback(async () => {
    const version = client.version(); const request = ++refreshVersion.current;
    const [user, nextFamily, library] = await Promise.all([api<Profile>('/profile'), api<Family>('/families/me'), api<LibraryPage>('/library?limit=100')]);
    const nextQuestions = nextFamily.status === 'connected' ? await api<Questions>('/questions/today') : null;
    if (version !== client.version() || request !== refreshVersion.current) return;
    setProfile(user); setFamily(nextFamily); setQuestions(nextQuestions); setStories(library.data.map(toStory)); setNextPage(library.next_skip); setError('');
  }, [api, client]);
  useEffect(() => {
    if (profile) appRef.current.applyServerPreferences({ role: profile.role, textScale: profile.text_scale, summaryStyle: profile.summary_style, parentLabel: family?.settings?.parent_label || appRef.current.parentLabel });
  }, [profile, family, app.preferencesReady]);
  useEffect(() => {
    let active = true;
    void client.restore().then(async restored => { if (restored && active) await refresh(); }).catch(e => { if (active) setError(e instanceof Error ? e.message : '로그인을 복원하지 못했어요. 다시 시도해주세요.'); }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [client, refresh]);
  useEffect(() => {
    if (!profile) return;
    const reload = () => { void refresh().catch(e => setError(e instanceof Error ? e.message : '새 정보를 불러오지 못했어요.')); };
    const listener = AppState.addEventListener('change', state => { if (state === 'active') reload(); });
    const timer = setInterval(reload, family?.status === 'waiting' ? 10000 : 60000);
    return () => { clearInterval(timer); listener.remove(); };
  }, [profile?.id, family?.status, refresh]);
  async function connect(email: string, password: string) {
    await client.login(email, password); setPreview(false); await refresh();
    return api<Profile>('/profile');
  }
  async function signup(email: string, password: string, fullName: string, role: Role) {
    await client.publicRequest('/users/signup', { email, password, full_name: fullName, role });
    return connect(email, password);
  }
  async function updateProfile(value: Parameters<Backend['updateProfile']>[0]) {
    refreshVersion.current += 1;
    const user = await api<Profile>('/profile', value, 'PATCH'); setProfile(user);
  }
  async function updateFamilyLabel(label: ParentLabel) { refreshVersion.current += 1; setFamily(await api<Family>('/families/me/settings', { parent_label: label }, 'PATCH')); }
  async function loadMore() {
    if (nextPage === null) return;
    const version = client.version(); const result = await api<LibraryPage>(`/library?limit=100&skip=${nextPage}`);
    if (version !== client.version()) return;
    setStories(items => [...new Map([...items, ...result.data.map(toStory)].map(item => [item.id, item])).values()]); setNextPage(result.next_skip);
  }
  const audioSource = useCallback(async (id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('올바른 음성이 아니에요.');
    const version = client.version(); const uri = `${base}/audio/${id}/content`;
    if (Platform.OS !== 'web') return { uri, headers: await client.headers() };
    const response = await client.request(`/audio/${id}/content`, { cache: 'no-store' }); const blob = await response.blob();
    if (version !== client.version()) throw new Error('계정 연결이 변경됐어요.');
    return { uri: URL.createObjectURL(blob) };
  }, [client]);
  const readPhoto = useCallback(async (id: string): Promise<string> => {
    const version = client.version(); const response = await client.request(`/photos/${encodeURIComponent(id)}/content`); const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => client.version() === version ? resolve(String(reader.result)) : reject(new Error('계정 연결이 변경됐어요.'));
      reader.onerror = () => reject(new Error('사진을 읽지 못했어요.')); reader.readAsDataURL(blob);
    });
  }, [client]);
  return <Context.Provider value={{ audioSource, readPhoto, ready, error, preview, startPreview: () => setPreview(true), connected: !!profile, profile, family, questions, stories, nextPage, loadMore, api, refresh, connect, signup, updateProfile, updateFamilyLabel, disconnect: client.logout, clearSession: client.clear }}>{children}</Context.Provider>;
}
export function useBackend() { const value = useContext(Context); if (!value) throw new Error('BackendProvider is required'); return value; }
