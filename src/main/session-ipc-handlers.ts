import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { app, ipcMain } from 'electron';
import {
  EMPTY_SESSION,
  type PersistedSession,
  SESSION_IPC,
} from '@/shared/ipc/session-ipc';

const SESSION_FILENAME = 'session.json';

function sessionPath(): string {
  return path.join(app.getPath('userData'), SESSION_FILENAME);
}

function sanitize(input: unknown): PersistedSession {
  if (typeof input !== 'object' || input === null) return EMPTY_SESSION;
  const obj = input as Record<string, unknown>;
  if (obj.version !== 1) return EMPTY_SESSION;
  const rawTabs = Array.isArray(obj.tabs) ? obj.tabs : [];
  const tabs = rawTabs
    .filter(
      (t): t is { repoPath: string; focusPath?: unknown } =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as { repoPath?: unknown }).repoPath === 'string',
    )
    .map((t) => {
      const out: { repoPath: string; focusPath?: string[] } = {
        repoPath: t.repoPath,
      };
      if (
        Array.isArray(t.focusPath) &&
        t.focusPath.every((s) => typeof s === 'string')
      ) {
        out.focusPath = t.focusPath as string[];
      }
      return out;
    });
  const activeIndex =
    typeof obj.activeIndex === 'number' &&
    obj.activeIndex >= 0 &&
    obj.activeIndex < tabs.length
      ? obj.activeIndex
      : tabs.length > 0
        ? 0
        : null;
  return { version: 1, tabs, activeIndex };
}

async function readSession(): Promise<PersistedSession> {
  try {
    const raw = await fs.readFile(sessionPath(), 'utf-8');
    return sanitize(JSON.parse(raw));
  } catch {
    return EMPTY_SESSION;
  }
}

async function writeSession(session: PersistedSession): Promise<void> {
  const dir = app.getPath('userData');
  await fs.mkdir(dir, { recursive: true });
  const dest = sessionPath();
  const tmp = `${dest}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(session, null, 2));
  await fs.rename(tmp, dest);
}

export function registerSessionHandlers(): void {
  ipcMain.handle(
    SESSION_IPC.LOAD,
    (): Promise<PersistedSession> => readSession(),
  );
  ipcMain.handle(
    SESSION_IPC.SAVE,
    async (_event, session: PersistedSession): Promise<void> => {
      await writeSession(sanitize(session));
    },
  );
}
