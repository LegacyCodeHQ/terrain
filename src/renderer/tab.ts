import type { ScanResult } from '@/shared/ipc/repo-ipc';

export type Tab =
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
export function nextTabId(): string {
  tabIdSeq += 1;
  return `tab-${tabIdSeq}`;
}

export function basenameOf(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

export function focusPathsEqual(
  a: string[] | undefined,
  b: string[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return (a?.length ?? 0) === (b?.length ?? 0);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
