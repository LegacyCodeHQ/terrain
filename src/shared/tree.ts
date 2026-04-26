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
