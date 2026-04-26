export interface TreeNode {
  name: string;
  children?: TreeNode[];
  /**
   * Leaf weight (file count). Set on file nodes (always 1 in v1).
   * Internal nodes have `children` and no `value`; d3.hierarchy().sum()
   * computes their total at render time.
   */
  value?: number;
}

/**
 * Build a tree from a flat list of POSIX-style relative file paths.
 * The tree's root has `name` set to `rootName`. Each file becomes a leaf
 * with `value: 1`. Empty input yields a root with no children.
 */
export function buildTree(rootName: string, paths: string[]): TreeNode {
  const root: TreeNode = { name: rootName, children: [] };
  for (const filePath of paths) {
    if (!filePath) continue;
    const segments = filePath.split('/').filter((s) => s.length > 0);
    if (segments.length === 0) continue;
    insertPath(root, segments);
  }
  return root;
}

function insertPath(root: TreeNode, segments: string[]): void {
  let cursor = root;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isLeaf = i === segments.length - 1;
    if (!cursor.children) cursor.children = [];
    let child = cursor.children.find((c) => c.name === segment);
    if (!child) {
      child = isLeaf
        ? { name: segment, value: 1 }
        : { name: segment, children: [] };
      cursor.children.push(child);
    }
    cursor = child;
  }
}
