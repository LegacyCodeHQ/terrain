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

  const naive = values.map((v) => (Math.max(v, 0) / total) * parentArc);
  const isUnder = naive.map((a) => a < minSweep);
  const countUnder = isUnder.filter(Boolean).length;
  if (countUnder === 0) return naive;

  const sumUnder = naive.reduce((s, a, i) => s + (isUnder[i] ? a : 0), 0);
  const sumOver = naive.reduce((s, a, i) => s + (isUnder[i] ? 0 : a), 0);
  const deficit = countUnder * minSweep - sumUnder;

  // If donors can't cover the inflation, fall back to proportional rather
  // than equal-split. Equal-split destroys LOC ratios the user expects to
  // see when they zoom into a small directory; proportional preserves them
  // at the cost of some labels being too small until zoomed.
  if (sumOver <= 0 || deficit >= sumOver) {
    return naive;
  }

  const shrinkFactor = (sumOver - deficit) / sumOver;
  return naive.map((a, i) => (isUnder[i] ? minSweep : a * shrinkFactor));
}

export interface ArcAllocableNode {
  value?: number;
  children?: ArcAllocableNode[];
  x0: number;
  x1: number;
  depth: number;
}

export interface RebalanceArcsOptions {
  /** Minimum arc length, in viewBox pixels at a node's midradius. */
  minSweepPx: number;
  /** Per-ring radius in viewBox pixels (matches Sunburst's RADIUS). */
  radius: number;
}

/**
 * Top-down rebalance of a partition-laid-out tree: per parent, redistribute
 * children's `(x0, x1)` so every child gets at least `minSweepPx` of arc
 * length at its midradius, with the deficit taken from larger siblings
 * proportionally to their share. The full angular range of each parent is
 * preserved; only the within-parent distribution changes.
 */
export function rebalanceArcs<N extends ArcAllocableNode>(
  node: N,
  options: RebalanceArcsOptions,
): void {
  const children = node.children as N[] | undefined;
  if (!children || children.length === 0) return;

  const parentArc = node.x1 - node.x0;
  const childDepth = node.depth + 1;
  const minSweep = options.minSweepPx / ((childDepth + 0.5) * options.radius);
  const arcs = allocateSiblingArcs(
    children.map((c) => c.value ?? 0),
    parentArc,
    minSweep,
  );

  let cursor = node.x0;
  for (let i = 0; i < children.length; i++) {
    children[i].x0 = cursor;
    cursor += arcs[i];
    children[i].x1 = cursor;
    rebalanceArcs(children[i], options);
  }
}
