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

export interface CoalesceOptions {
  /** Minimum arc length, in viewBox pixels at the node's midradius, for a
   *  child label to be considered legible. Children below this within the
   *  same parent get bucketed into a single "N small files" sibling. */
  minLabelArcPx: number;
  /** Per-ring radius in viewBox pixels — must match Sunburst's `RADIUS`. */
  radius: number;
  /** Minimum number of small siblings required before coalescing kicks in.
   *  Defaults to 2: replacing one sliver with one bucket has no width gain. */
  minToCoalesce?: number;
}

/**
 * Replace illegibly-thin sibling slices with a single "N small files" bucket
 * per parent. A child's arc length at midradius is computed analytically from
 * its share of total LOC and its depth (which matches d3.partition's layout
 * with `size([2π, height + 1])`); children whose computed arc falls below
 * `minLabelArcPx` are bucketed together. Total LOC is preserved.
 */
export function coalesceSmallNodes(
  tree: TreeNode,
  options: CoalesceOptions,
): TreeNode {
  const total = sumLeafValues(tree);
  return transform(tree, 0, total, options).node;
}

interface Transformed {
  node: TreeNode;
  value: number;
}

function sumLeafValues(node: TreeNode): number {
  if (node.value !== undefined) return node.value;
  return (node.children ?? []).reduce((acc, c) => acc + sumLeafValues(c), 0);
}

function transform(
  node: TreeNode,
  depth: number,
  totalValue: number,
  options: CoalesceOptions,
): Transformed {
  if (!node.children || node.children.length === 0) {
    return { node, value: node.value ?? 0 };
  }
  if (totalValue <= 0) {
    return { node, value: 0 };
  }

  const childDepth = depth + 1;
  const midRadiusFactor = childDepth + 0.5;
  const minToCoalesce = options.minToCoalesce ?? 2;

  const transformedChildren = node.children.map((c) =>
    transform(c, childDepth, totalValue, options),
  );

  const small: Transformed[] = [];
  const big: Transformed[] = [];
  for (const t of transformedChildren) {
    const arcPx =
      (t.value / totalValue) * 2 * Math.PI * midRadiusFactor * options.radius;
    if (arcPx < options.minLabelArcPx) small.push(t);
    else big.push(t);
  }

  const newChildren: TreeNode[] = big.map((t) => t.node);
  if (small.length >= minToCoalesce) {
    const sum = small.reduce((acc, t) => acc + t.value, 0);
    newChildren.push({
      name: `${small.length} small files`,
      value: sum,
    });
  } else {
    for (const t of small) newChildren.push(t.node);
  }

  const subtreeValue = transformedChildren.reduce((acc, t) => acc + t.value, 0);
  return { node: { ...node, children: newChildren }, value: subtreeValue };
}
