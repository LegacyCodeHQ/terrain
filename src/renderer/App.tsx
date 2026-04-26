import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Toolbar } from './components/Toolbar';

type AppState =
  | { kind: 'empty' }
  | { kind: 'scanning'; repoPath: string; filesScanned: number }
  | { kind: 'loaded'; result: ScanResult };

export function App() {
  const [state, setState] = useState<AppState>({ kind: 'empty' });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const off = window.electronAPI.on(REPO_IPC.SCAN_PROGRESS, (...args) => {
      const progress = args[0] as ScanProgress | undefined;
      if (!progress) return;
      const current = stateRef.current;
      if (current.kind !== 'scanning') return;
      setState({ ...current, filesScanned: progress.filesScanned });
    });
    return () => off();
  }, []);

  const showError = useCallback(async (title: string, message: string) => {
    await window.electronAPI.invoke(DIALOG_IPC.SHOW_ERROR, { title, message });
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
      setState({ kind: 'empty' });
      return;
    }

    setState({ kind: 'scanning', repoPath, filesScanned: 0 });

    const result = (await window.electronAPI.invoke(REPO_IPC.SCAN, {
      repoPath,
    })) as ScanResult;

    if (result.fileCount === 0) {
      await showError(
        'Empty repository',
        'No tracked files in this repository.',
      );
      setState({ kind: 'empty' });
      return;
    }

    setState({ kind: 'loaded', result });
  }, [showError]);

  const closeRepository = useCallback(() => {
    setState({ kind: 'empty' });
  }, []);

  const repoName = state.kind === 'loaded' ? state.result.repoName : undefined;

  return (
    <div className="app">
      <Toolbar
        repoName={repoName}
        onOpen={openRepository}
        onClose={state.kind === 'loaded' ? closeRepository : undefined}
      />
      <div className="workspace">
        {state.kind === 'empty' ? <EmptyState onOpen={openRepository} /> : null}
        {state.kind === 'scanning' ? (
          <ProgressIndicator
            mode="centered"
            filesScanned={state.filesScanned}
          />
        ) : null}
        {state.kind === 'loaded' ? <Sunburst data={state.result.tree} /> : null}
      </div>
    </div>
  );
}
