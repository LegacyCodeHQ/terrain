import { execFile, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { ipcMain, type WebContents } from 'electron';
import {
  REPO_IPC,
  type RepoValidation,
  type ScanResult,
} from '@/shared/ipc/repo-ipc';
import { buildTree, type FileWeight } from '@/shared/tree';

const execFileAsync = promisify(execFile);

const PROGRESS_INTERVAL_MS = 50;
const LOC_READ_CONCURRENCY = 16;
const NEWLINE = 0x0a;

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

/**
 * Counts lines in a file by scanning its bytes for `\n`. Returns 0 for files
 * that can't be read (missing on disk, permission denied, etc.) so that one
 * unreadable file doesn't fail the whole scan.
 */
async function countLines(absPath: string): Promise<number> {
  try {
    const buf = await fs.readFile(absPath);
    if (buf.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === NEWLINE) count++;
    }
    // If the last byte isn't a newline, the trailing partial line still counts.
    if (buf[buf.length - 1] !== NEWLINE) count++;
    return count;
  } catch {
    return 0;
  }
}

/**
 * Reads each file and counts LOC, with bounded concurrency. Reports progress
 * (file count completed) via the provided callback, throttled.
 */
async function countLocForFiles(
  repoPath: string,
  files: string[],
  onProgress: (filesProcessed: number) => void,
): Promise<FileWeight[]> {
  const results: FileWeight[] = new Array(files.length);
  let nextIndex = 0;
  let completed = 0;
  let lastTick = Date.now();

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= files.length) return;
      const relPath = files[i];
      const value = await countLines(path.join(repoPath, relPath));
      results[i] = { path: relPath, value };
      completed++;
      const now = Date.now();
      if (now - lastTick >= PROGRESS_INTERVAL_MS) {
        onProgress(completed);
        lastTick = now;
      }
    }
  }

  const workerCount = Math.min(LOC_READ_CONCURRENCY, files.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  onProgress(completed);
  return results;
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
      const filtered = await applyGitattributesFilter(repoPath, tracked);

      const weights = await countLocForFiles(repoPath, filtered, (n) =>
        notifyProgress(sender, n),
      );

      const repoName = path.basename(path.resolve(repoPath));
      const tree = buildTree(repoName, weights);
      const totalLines = weights.reduce((sum, w) => sum + w.value, 0);

      return {
        repoPath,
        repoName,
        fileCount: weights.length,
        totalLines,
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
  countLines,
  countLocForFiles,
};
