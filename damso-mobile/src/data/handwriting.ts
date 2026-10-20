export const storyHandwriting = ['StoryHandOne', 'StoryHandTwo', 'StoryHandThree'] as const;
export function nextHandwriting(index: number) { return (index + 1) % storyHandwriting.length; }
