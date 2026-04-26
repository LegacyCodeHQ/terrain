export interface TreeNode {
  name: string;
  children?: TreeNode[];
  /**
   * Leaf weight (lines of code). Internal nodes have `children` and no
   * `value`; d3.hierarchy().sum() computes their total at render time.
   */
  value?: number;
}

export interface FileWeight {
  path: string;
  value: number;
}

/**
 * Build a tree from weighted file entries. The tree's root has `name` set to
 * `rootName`. Each file becomes a leaf with the given `value` (LOC). Empty
 * input yields a root with no children.
 */
export function buildTree(rootName: string, files: FileWeight[]): TreeNode {
  const root: TreeNode = { name: rootName, children: [] };
  for (const { path: filePath, value } of files) {
    if (!filePath) continue;
    const segments = filePath.split('/').filter((s) => s.length > 0);
    if (segments.length === 0) continue;
    insertPath(root, segments, value);
  }
  return root;
}

function insertPath(root: TreeNode, segments: string[], value: number): void {
  let cursor = root;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isLeaf = i === segments.length - 1;
    if (!cursor.children) cursor.children = [];
    let child = cursor.children.find((c) => c.name === segment);
    if (!child) {
      child = isLeaf
        ? { name: segment, value }
        : { name: segment, children: [] };
      cursor.children.push(child);
    }
    cursor = child;
  }
}

/**
 * Divide `parentArc` among siblings proportionally to their `values`, while
 * guaranteeing every sibling at least `minSweep`. Children that would be
 * thinner than the minimum are bumped up; the deficit is taken from larger
 * siblings proportionally to their excess. If the minimum can't be satisfied
 * for everyone (parentArc < n * minSweep), every sibling gets an equal slice.
 *
 * Returned values are in the same units as `parentArc` and `minSweep` (the
 * caller decides — typically radians for a sunburst). They sum to `parentArc`
 * up to floating-point error.
 */
export function allocateSiblingArcs(
  values: number[],
  parentArc: number,
  minSweep: number,
): number[] {
  const n = values.length;
  if (n === 0) return [];

  const total = values.reduce((s, v) => s + Math.max(v, 0), 0);
  if (total <= 0) return new Array(n).fill(parentArc / n);

  if (minSweep * n >= parentArc) {
    return new Array(n).fill(parentArc / n);
  }

  const naive = values.map((v) => (Math.max(v, 0) / total) * parentArc);
  const isUnder = naive.map((a) => a < minSweep);
  const countUnder = isUnder.filter(Boolean).length;
  if (countUnder === 0) return naive;

  const sumUnder = naive.reduce((s, a, i) => s + (isUnder[i] ? a : 0), 0);
  const sumOver = naive.reduce((s, a, i) => s + (isUnder[i] ? 0 : a), 0);
  const deficit = countUnder * minSweep - sumUnder;
  const shrinkFactor = (sumOver - deficit) / sumOver;

  return naive.map((a, i) => (isUnder[i] ? minSweep : a * shrinkFactor));
}
