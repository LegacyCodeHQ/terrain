export const REPO_IPC = {
  VALIDATE: 'repo:validate',
  SCAN: 'repo:scan',
  SCAN_PROGRESS: 'repo:scan-progress',
} as const;

export type RepoValidation =
  | { ok: true }
  | { ok: false; reason: 'not-a-git-repo' };

export type ScanProgress = {
  scanId: string;
  filesScanned: number;
};

export type ScanResult = {
  scanId: string;
  repoPath: string;
  repoName: string;
  fileCount: number;
  totalLines: number;
  tree: import('../tree').TreeNode;
};
