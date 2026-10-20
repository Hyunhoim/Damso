import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeStory, sampleStories, type Role, type Story } from './data/stories';
import { isParentLabel, parentLabelStorageKey, type ParentLabel } from './data/family';
import { migratePreferences, preferencesStorageKey, legacyPreferencesStorageKey, isSummaryStyle, type Preferences, type SummaryStyle } from './data/preferences';

type AppState = { summaryStyle: SummaryStyle; onboardingComplete: boolean; preferencesReady: boolean; preferencesError: string; preferencesSaving: boolean; savePreferences: (value: Preferences) => Promise<boolean>; role: Role; setRole: (role: Role) => void; textScale: number; setTextScale: (scale: number) => void; stories: Story[]; addStory: (answer: string) => void; parentLabel: ParentLabel; setParentLabel: (label: ParentLabel) => Promise<void>; familySettingsReady: boolean; familySettingsSaving: boolean; familySettingsError: string; familySettingsSaved: boolean };
const StateContext = createContext<AppState | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>('auto');
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const preferenceSave = useRef(false);
  const [role, setRole] = useState<Role>('parent');
  const [textScale, setTextScale] = useState(1);
  const [stories, setStories] = useState(sampleStories);
  const [parentLabel, updateParentLabel] = useState<ParentLabel>('부모님');
  const [familySettingsReady, setFamilySettingsReady] = useState(false);
  const [familySettingsSaving, setFamilySettingsSaving] = useState(false);
  const [familySettingsError, setFamilySettingsError] = useState('');
  const [familySettingsSaved, setFamilySettingsSaved] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(parentLabelStorageKey), AsyncStorage.getItem(preferencesStorageKey), AsyncStorage.getItem(legacyPreferencesStorageKey)])
      .then(([label, raw, legacy]) => {
        if (!active) return;
        const preference = migratePreferences(raw, legacy);
        if (isParentLabel(label)) updateParentLabel(label);
        else if (preference) updateParentLabel(preference.parentLabel);
        if (preference) { setSummaryStyle(preference.summaryStyle); setRole(preference.role); setOnboardingComplete(preference.completed); }
      })
      .catch(() => { if (active) { setFamilySettingsError('저장된 설정을 불러오지 못했어요. 다시 선택해주세요.'); setPreferencesError('설정을 불러오지 못했어요. 다시 선택해주세요.'); } })
      .finally(() => { if (active) { setFamilySettingsReady(true); setPreferencesReady(true); } });
    return () => { active = false; };
  }, []);
  async function setParentLabel(label: ParentLabel) {
    if (!familySettingsReady || saving.current || preferenceSave.current || !isParentLabel(label)) return;
    saving.current = true;
    setFamilySettingsSaving(true); setFamilySettingsError(''); setFamilySettingsSaved(false);
    try {
      await AsyncStorage.setItem(parentLabelStorageKey, label);
      updateParentLabel(label); setFamilySettingsSaved(true);
    } catch {
      setFamilySettingsError('호칭을 저장하지 못했어요. 다시 선택해주세요.');
    } finally {
      saving.current = false; setFamilySettingsSaving(false);
    }
  }
  async function savePreferences(value: Preferences): Promise<boolean> {
    if (!preferencesReady || preferenceSave.current || saving.current || !isSummaryStyle(value.summaryStyle) || !isParentLabel(value.parentLabel) || !['parent', 'child'].includes(value.role)) return false;
    preferenceSave.current = true; setPreferencesSaving(true); setPreferencesError('');
    try {
      await AsyncStorage.multiSet([[preferencesStorageKey, JSON.stringify(value)], [parentLabelStorageKey, value.parentLabel]]);
      setRole(value.role); updateParentLabel(value.parentLabel); setSummaryStyle(value.summaryStyle); setOnboardingComplete(value.completed);
      return true;
    } catch {
      setPreferencesError('설정을 저장하지 못했어요. 다시 시도해주세요.'); return false;
    } finally { preferenceSave.current = false; setPreferencesSaving(false); }
  }
  function addStory(answer: string) {
    const story = makeStory(answer, role);
    setStories(current => [story, ...current]);
  }
  return <StateContext.Provider value={{ summaryStyle, onboardingComplete, preferencesReady, preferencesError, preferencesSaving, savePreferences, role, setRole, textScale, setTextScale, stories, addStory, parentLabel, setParentLabel, familySettingsReady, familySettingsSaving, familySettingsError, familySettingsSaved }}>{children}</StateContext.Provider>;
}
export function useApp() {
  const state = useContext(StateContext);
  if (!state) throw new Error('AppProvider is required.');
  return state;
}
