import { useCallback, useEffect, useState } from 'react';
import { DIALOG_IPC } from '@/shared/ipc/dialog-ipc';
import {
  REPO_IPC,
  type RepoValidation,
  type ScanProgress,
  type ScanResult,
} from '@/shared/ipc/repo-ipc';
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
    }
  | {
      id: string;
      kind: 'loaded';
      repoPath: string;
      title: string;
      result: ScanResult;
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

export function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

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

  const showError = useCallback(async (title: string, message: string) => {
    await window.electronAPI.invoke(DIALOG_IPC.SHOW_ERROR, { title, message });
  }, []);

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

  const openRepository = useCallback(async () => {
    const repoPath = (await window.electronAPI.invoke(
      DIALOG_IPC.OPEN_DIRECTORY,
    )) as string | null;
    if (!repoPath) return;

    const validation = (await window.electronAPI.invoke(REPO_IPC.VALIDATE, {
      repoPath,
    })) as RepoValidation;

    if (!validation.ok) {
      await showError(
        'Not a git repository',
        'This folder is not a git repository.',
      );
      return;
    }

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

    const result = (await window.electronAPI.invoke(REPO_IPC.SCAN, {
      scanId: id,
      repoPath,
    })) as ScanResult;

    if (result.fileCount === 0) {
      await showError(
        'Empty repository',
        'No tracked files in this repository.',
      );
      removeTab(id);
      return;
    }

    setTabs((prev) =>
      prev.map((t) =>
        t.id === id
          ? { id, kind: 'loaded', repoPath, title: result.repoName, result }
          : t,
      ),
    );
  }, [showError, removeTab]);

  const switchTab = useCallback((id: string) => {
    setActiveTabId(id);
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
          <Sunburst key={activeTab.id} data={activeTab.result.tree} />
        ) : null}
      </div>
    </div>
  );
}
