import { createContext, useContext, useState, type ReactNode } from 'react';
import { makeStory, sampleStories, type Role, type Story } from './data/stories';

type AppState = { role: Role; setRole: (role: Role) => void; textScale: number; setTextScale: (scale: number) => void; stories: Story[]; addStory: (answer: string) => void };
const StateContext = createContext<AppState | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('parent');
  const [textScale, setTextScale] = useState(1);
  const [stories, setStories] = useState(sampleStories);
  function addStory(answer: string) {
    const story = makeStory(answer, role);
    setStories(current => [story, ...current]);
  }
  return <StateContext.Provider value={{ role, setRole, textScale, setTextScale, stories, addStory }}>{children}</StateContext.Provider>;
}
export function useApp() {
  const state = useContext(StateContext);
  if (!state) throw new Error('AppProvider is required.');
  return state;
}
