import { execFile, spawn } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { ipcMain, type WebContents } from 'electron';
import {
  REPO_IPC,
  type RepoValidation,
  type ScanResult,
} from '@/shared/ipc/repo-ipc';
import { buildTree } from '@/shared/tree';

const execFileAsync = promisify(execFile);

const PROGRESS_INTERVAL_MS = 50;

async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      { cwd: repoPath },
    );
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

async function listTrackedFiles(repoPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: repoPath,
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout.split('\0').filter((p) => p.length > 0);
}

/**
 * Drop files marked `linguist-generated`, `linguist-vendored`, or `binary`
 * via .gitattributes. Streams the file list into `git check-attr --stdin`
 * to keep this O(1) subprocesses regardless of repo size.
 */
async function applyGitattributesFilter(
  repoPath: string,
  files: string[],
): Promise<string[]> {
  if (files.length === 0) return files;
  const attrs = ['linguist-generated', 'linguist-vendored', 'binary'];

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn('git', ['check-attr', '--stdin', '-z', ...attrs], {
      cwd: repoPath,
    });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks).toString('utf8'));
      } else {
        reject(new Error(`git check-attr exited ${code}: ${stderr}`));
      }
    });
    child.stdin.end(files.join('\0'));
  });

  // Output is NUL-separated triplets: <path>\0<attr>\0<value>\0
  const tokens = stdout.split('\0');
  const excluded = new Set<string>();
  for (let i = 0; i + 2 < tokens.length; i += 3) {
    const file = tokens[i];
    const value = tokens[i + 2];
    if (value === 'set' || value === 'true') {
      excluded.add(file);
    }
  }
  return files.filter((f) => !excluded.has(f));
}

function notifyProgress(sender: WebContents, filesScanned: number): void {
  sender.send(REPO_IPC.SCAN_PROGRESS, { filesScanned });
}

export function registerRepoHandlers(): void {
  ipcMain.handle(
    REPO_IPC.VALIDATE,
    async (
      _event,
      { repoPath }: { repoPath: string },
    ): Promise<RepoValidation> => {
      const ok = await isGitRepo(repoPath);
      return ok ? { ok: true } : { ok: false, reason: 'not-a-git-repo' };
    },
  );

  ipcMain.handle(
    REPO_IPC.SCAN,
    async (event, { repoPath }: { repoPath: string }): Promise<ScanResult> => {
      const sender = event.sender;
      notifyProgress(sender, 0);

      const tracked = await listTrackedFiles(repoPath);
      notifyProgress(sender, tracked.length);

      const filtered = await applyGitattributesFilter(repoPath, tracked);

      // Throttle progress while building the tree so the indicator animates
      // for moderately large repos without flooding IPC.
      let lastTick = Date.now();
      let scanned = 0;
      const paths: string[] = [];
      for (const p of filtered) {
        paths.push(p);
        scanned++;
        const now = Date.now();
        if (now - lastTick >= PROGRESS_INTERVAL_MS) {
          notifyProgress(sender, scanned);
          lastTick = now;
        }
      }
      notifyProgress(sender, scanned);

      const repoName = path.basename(path.resolve(repoPath));
      const tree = buildTree(repoName, paths);

      return {
        repoPath,
        repoName,
        fileCount: paths.length,
        tree,
      };
    },
  );
}

// Exported for tests.
export const _internal = {
  isGitRepo,
  listTrackedFiles,
  applyGitattributesFilter,
};
