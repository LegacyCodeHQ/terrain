export const SESSION_IPC = {
  LOAD: 'session:load',
  SAVE: 'session:save',
} as const;

export type PersistedSession = {
  version: 1;
  tabs: Array<{ repoPath: string; focusPath?: string[] }>;
  activeIndex: number | null;
};

export const EMPTY_SESSION: PersistedSession = {
  version: 1,
  tabs: [],
  activeIndex: null,
};
