import { buildTree, coalesceSmallNodes } from './tree';

describe('buildTree', () => {
  it('returns a root with no children for empty input', () => {
    expect(buildTree('repo', [])).toEqual({ name: 'repo', children: [] });
  });

  it('builds a single-level tree for top-level files with LOC', () => {
    const tree = buildTree('repo', [
      { path: 'README.md', value: 42 },
      { path: 'LICENSE', value: 21 },
    ]);
    expect(tree).toEqual({
      name: 'repo',
      children: [
        { name: 'README.md', value: 42 },
        { name: 'LICENSE', value: 21 },
      ],
    });
  });

  it('nests directories from path segments', () => {
    const tree = buildTree('repo', [
      { path: 'src/main/main.ts', value: 100 },
      { path: 'src/main/preload.ts', value: 10 },
      { path: 'src/renderer/App.tsx', value: 250 },
    ]);
    expect(tree).toEqual({
      name: 'repo',
      children: [
        {
          name: 'src',
          children: [
            {
              name: 'main',
              children: [
                { name: 'main.ts', value: 100 },
                { name: 'preload.ts', value: 10 },
              ],
            },
            {
              name: 'renderer',
              children: [{ name: 'App.tsx', value: 250 }],
            },
          ],
        },
      ],
    });
  });

  it('skips empty path entries', () => {
    const tree = buildTree('repo', [
      { path: '', value: 5 },
      { path: 'a.txt', value: 7 },
    ]);
    expect(tree.children).toEqual([{ name: 'a.txt', value: 7 }]);
  });

  it('preserves zero-value leaves (e.g., empty files)', () => {
    const tree = buildTree('repo', [{ path: 'empty.txt', value: 0 }]);
    expect(tree.children).toEqual([{ name: 'empty.txt', value: 0 }]);
  });
});

describe('coalesceSmallNodes', () => {
  // Radius of 155 (≈ Sunburst's WIDTH/6) and a 16px arc threshold mirror the
  // renderer's defaults closely enough to exercise the math in tests.
  const opts = { minLabelArcPx: 16, radius: 155 };

  it('leaves a directory of evenly-sized siblings untouched', () => {
    const tree = buildTree('repo', [
      { path: 'a.ts', value: 100 },
      { path: 'b.ts', value: 100 },
      { path: 'c.ts', value: 100 },
    ]);
    expect(coalesceSmallNodes(tree, opts)).toEqual(tree);
  });

  it('buckets ≥ 2 illegibly-thin siblings into "N small files"', () => {
    const tree = buildTree('repo', [
      { path: 'big.rs', value: 5000 },
      { path: 't1.rs', value: 1 },
      { path: 't2.rs', value: 1 },
      { path: 't3.rs', value: 1 },
    ]);
    const result = coalesceSmallNodes(tree, opts);
    expect(result.children).toEqual([
      { name: 'big.rs', value: 5000 },
      { name: '3 small files', value: 3 },
    ]);
  });

  it('leaves a single small sibling alone (one sliver < one bucket)', () => {
    const tree = buildTree('repo', [
      { path: 'big.rs', value: 5000 },
      { path: 'tiny.rs', value: 1 },
    ]);
    const result = coalesceSmallNodes(tree, opts);
    expect(result.children).toEqual([
      { name: 'big.rs', value: 5000 },
      { name: 'tiny.rs', value: 1 },
    ]);
  });

  it('preserves total LOC across the transform', () => {
    const tree = buildTree('repo', [
      { path: 'big.rs', value: 5000 },
      { path: 'a.rs', value: 2 },
      { path: 'b.rs', value: 3 },
      { path: 'c.rs', value: 4 },
    ]);
    const before = sumLeafValues(tree);
    const after = sumLeafValues(coalesceSmallNodes(tree, opts));
    expect(after).toBe(before);
  });

  it('coalesces independently per directory', () => {
    const tree = buildTree('repo', [
      { path: 'main.rs', value: 5000 },
      { path: 'src/a.rs', value: 2 },
      { path: 'src/b.rs', value: 3 },
      { path: 'src/c.rs', value: 4 },
      { path: 'lib/big.rs', value: 4000 },
      { path: 'lib/medium.rs', value: 1500 },
    ]);
    const result = coalesceSmallNodes(tree, opts);
    const src = result.children?.find((c) => c.name === 'src');
    const lib = result.children?.find((c) => c.name === 'lib');
    expect(src?.children).toEqual([{ name: '3 small files', value: 9 }]);
    expect(lib?.children).toEqual([
      { name: 'big.rs', value: 4000 },
      { name: 'medium.rs', value: 1500 },
    ]);
  });

  it('applies the threshold at every depth, not just the root ring', () => {
    // arcPx = (value / total) * 2π * (depth + 0.5) * radius — so the check
    // runs at every depth with a depth-scaled midradius. With these values
    // the depth-4 leaves have arcPx ≈ 2.4 (well below 16) and get bucketed.
    const tree = buildTree('repo', [
      { path: 'main.rs', value: 9000 },
      { path: 'a/b/c/x.rs', value: 5 },
      { path: 'a/b/c/y.rs', value: 5 },
      { path: 'a/b/c/z.rs', value: 5 },
    ]);
    const result = coalesceSmallNodes(tree, opts);
    const c = result.children
      ?.find((n) => n.name === 'a')
      ?.children?.find((n) => n.name === 'b')
      ?.children?.find((n) => n.name === 'c');
    expect(c?.children).toEqual([{ name: '3 small files', value: 15 }]);
  });

  it('passes through trees with zero total LOC', () => {
    const tree = buildTree('repo', [{ path: 'empty.txt', value: 0 }]);
    expect(coalesceSmallNodes(tree, opts)).toEqual(tree);
  });
});

function sumLeafValues(node: {
  value?: number;
  children?: Array<{ value?: number; children?: unknown[] }>;
}): number {
  if (node.value !== undefined) return node.value;
  return (node.children ?? []).reduce(
    // biome-ignore lint/suspicious/noExplicitAny: test-only recursive helper
    (acc: number, c: any) => acc + sumLeafValues(c),
    0,
  );
}
