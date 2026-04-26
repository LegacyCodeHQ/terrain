import { useCallback, useEffect, useRef, useState } from 'react';
import { DIALOG_IPC } from '@/shared/ipc/dialog-ipc';
import {
  REPO_IPC,
  type RepoValidation,
  type ScanProgress,
  type ScanResult,
} from '@/shared/ipc/repo-ipc';
import { type PersistedSession, SESSION_IPC } from '@/shared/ipc/session-ipc';
import { EmptyState } from './components/EmptyState';
import { ProgressIndicator } from './components/ProgressIndicator';
import { Sunburst } from './components/Sunburst';
import { TabBar } from './components/TabBar';

type Tab =
  | {
      id: string;
      kind: 'scanning';
      repoPath: string;
      title: string;
      filesScanned: number;
      pendingFocusPath?: string[];
    }
  | {
      id: string;
      kind: 'loaded';
      repoPath: string;
      title: string;
      result: ScanResult;
      focusPath?: string[];
    };

let tabIdSeq = 0;
function nextTabId(): string {
  tabIdSeq += 1;
  return `tab-${tabIdSeq}`;
}

function basenameOf(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function focusPathsEqual(
  a: string[] | undefined,
  b: string[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return (a?.length ?? 0) === (b?.length ?? 0);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const removeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((current) => {
        if (current !== id) return current;
        if (next.length === 0) return null;
        // Prefer the tab to the left of the closed one.
        return next[Math.min(Math.max(idx - 1, 0), next.length - 1)].id;
      });
      return next;
    });
  }, []);

  const showError = useCallback(async (title: string, message: string) => {
    await window.electronAPI.invoke(DIALOG_IPC.SHOW_ERROR, { title, message });
  }, []);

  /** Validate a repoPath, scan it, and transition the tab to `loaded`. On
   * any failure (not a repo / no tracked files), drop the tab. When
   * `silent` is true, skip the user-facing error dialog (used during
   * session restore). */
  const scanIntoTab = useCallback(
    async (id: string, repoPath: string, silent: boolean) => {
      const validation = (await window.electronAPI.invoke(REPO_IPC.VALIDATE, {
        repoPath,
      })) as RepoValidation;

      if (!validation.ok) {
        if (!silent) {
          await showError(
            'Not a git repository',
            'This folder is not a git repository.',
          );
        }
        removeTab(id);
        return;
      }

      const result = (await window.electronAPI.invoke(REPO_IPC.SCAN, {
        scanId: id,
        repoPath,
      })) as ScanResult;

      if (result.fileCount === 0) {
        if (!silent) {
          await showError(
            'Empty repository',
            'No tracked files in this repository.',
          );
        }
        removeTab(id);
        return;
      }

      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          // Carry over any pending focusPath from the scanning tab so it
          // gets handed to the Sunburst as initialFocusPath on mount.
          const pending =
            t.kind === 'scanning' ? t.pendingFocusPath : undefined;
          return {
            id,
            kind: 'loaded',
            repoPath,
            title: result.repoName,
            result,
            focusPath: pending,
          };
        }),
      );
    },
    [showError, removeTab],
  );

  // SCAN_PROGRESS subscription, mounted once.
  useEffect(() => {
    const off = window.electronAPI.on(REPO_IPC.SCAN_PROGRESS, (...args) => {
      const progress = args[0] as ScanProgress | undefined;
      if (!progress) return;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === progress.scanId && t.kind === 'scanning'
            ? { ...t, filesScanned: progress.filesScanned }
            : t,
        ),
      );
    });
    return () => off();
  }, []);

  // Restore the previous session on first mount. Idempotent via the
  // `hydrated` guard so it cannot run twice even if scanIntoTab's identity
  // changes.
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    (async () => {
      const session = (await window.electronAPI.invoke(
        SESSION_IPC.LOAD,
      )) as PersistedSession;
      if (cancelled) return;

      if (session.tabs.length === 0) {
        setHydrated(true);
        return;
      }

      const restored = session.tabs.map((t) => ({
        id: nextTabId(),
        repoPath: t.repoPath,
        focusPath: t.focusPath,
      }));
      const initialTabs: Tab[] = restored.map((r) => ({
        id: r.id,
        kind: 'scanning',
        repoPath: r.repoPath,
        title: basenameOf(r.repoPath),
        filesScanned: 0,
        pendingFocusPath: r.focusPath,
      }));
      setTabs(initialTabs);
      const activeIdx = session.activeIndex;
      if (activeIdx !== null && activeIdx >= 0 && activeIdx < restored.length) {
        setActiveTabId(restored[activeIdx].id);
      } else {
        setActiveTabId(restored[0].id);
      }
      setHydrated(true);

      // Kick off scans concurrently. Each call is independent; failures
      // self-prune via removeTab.
      for (const r of restored) {
        void scanIntoTab(r.id, r.repoPath, true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, scanIntoTab]);

  // Save the session whenever tabs / active tab change after hydration.
  // Persists only repoPaths and the active index — scan results are derived
  // fresh on next launch so they stay current.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const activeIndex =
        activeTabId === null
          ? null
          : (() => {
              const i = tabs.findIndex((t) => t.id === activeTabId);
              return i >= 0 ? i : null;
            })();
      const payload: PersistedSession = {
        version: 1,
        tabs: tabs.map((t) => {
          const focusPath =
            t.kind === 'loaded'
              ? t.focusPath
              : t.kind === 'scanning'
                ? t.pendingFocusPath
                : undefined;
          return focusPath && focusPath.length > 1
            ? { repoPath: t.repoPath, focusPath }
            : { repoPath: t.repoPath };
        }),
        activeIndex,
      };
      void window.electronAPI.invoke(SESSION_IPC.SAVE, payload);
    }, 200);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [tabs, activeTabId, hydrated]);

  const openRepository = useCallback(async () => {
    const repoPath = (await window.electronAPI.invoke(
      DIALOG_IPC.OPEN_DIRECTORY,
    )) as string | null;
    if (!repoPath) return;

    const id = nextTabId();
    const title = basenameOf(repoPath);
    const newTab: Tab = {
      id,
      kind: 'scanning',
      repoPath,
      title,
      filesScanned: 0,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(id);

    await scanIntoTab(id, repoPath, false);
  }, [scanIntoTab]);

  const switchTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const updateFocusPath = useCallback((id: string, path: string[]) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.kind === 'loaded') {
          // Skip if unchanged to avoid a redundant save round-trip.
          if (focusPathsEqual(t.focusPath, path)) return t;
          return { ...t, focusPath: path };
        }
        return t;
      }),
    );
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="app">
      {tabs.length === 0 ? (
        <div className="titlebar-spacer" aria-hidden="true" />
      ) : (
        <TabBar
          tabs={tabs.map((t) => ({ id: t.id, title: t.title }))}
          activeTabId={activeTabId}
          onSwitch={switchTab}
          onClose={removeTab}
          onAdd={openRepository}
        />
      )}
      <div className="workspace">
        {activeTab === null ? <EmptyState onOpen={openRepository} /> : null}
        {activeTab?.kind === 'scanning' ? (
          <ProgressIndicator
            mode="centered"
            filesScanned={activeTab.filesScanned}
          />
        ) : null}
        {activeTab?.kind === 'loaded' ? (
          <Sunburst
            key={activeTab.id}
            data={activeTab.result.tree}
            initialFocusPath={activeTab.focusPath}
            onFocusChange={(path) => updateFocusPath(activeTab.id, path)}
          />
        ) : null}
      </div>
    </div>
  );
}
