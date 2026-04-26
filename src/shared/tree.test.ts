import { allocateSiblingArcs, buildTree } from './tree';

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

describe('allocateSiblingArcs', () => {
  const sumClose = (xs: number[], target: number) =>
    Math.abs(xs.reduce((a, b) => a + b, 0) - target) < 1e-9;

  it('returns naive proportional allocation when nothing is under min', () => {
    const arcs = allocateSiblingArcs([100, 100, 200], 4, 0.1);
    expect(arcs).toEqual([1, 1, 2]);
  });

  it('inflates a thin slice and shrinks larger siblings proportionally', () => {
    // 4 total arc, minSweep 0.5. Values [1, 99] would naively give [0.04, 3.96].
    // The 0.04 child gets bumped to 0.5; the 99-child shrinks by 0.46.
    const arcs = allocateSiblingArcs([1, 99], 4, 0.5);
    expect(arcs[0]).toBeCloseTo(0.5, 9);
    expect(arcs[1]).toBeCloseTo(3.5, 9);
    expect(sumClose(arcs, 4)).toBe(true);
  });

  it('falls back to equal split when min cannot be satisfied for all', () => {
    // 4 children, min 1.5 each, parent 4 → can't fit (would need 6).
    const arcs = allocateSiblingArcs([1, 1, 1, 1], 4, 1.5);
    expect(arcs).toEqual([1, 1, 1, 1]);
  });

  it('shares deficit across multiple oversized siblings by their share', () => {
    // Parent 10. Values [1, 30, 70]. minSweep 1. Naive ≈ [0.099, 2.97, 6.93].
    // The 0.099 gets bumped to 1; the 0.901 deficit is taken from 2.97 and
    // 6.93 proportionally to their share of sumOver (9.901).
    const arcs = allocateSiblingArcs([1, 30, 70], 10, 1);
    expect(arcs[0]).toBeCloseTo(1, 9);
    expect(arcs[1]).toBeCloseTo(2.7, 2);
    expect(arcs[2]).toBeCloseTo(6.3, 2);
    expect(sumClose(arcs, 10)).toBe(true);
  });

  it('returns equal split when total value is zero', () => {
    expect(allocateSiblingArcs([0, 0, 0], 6, 0.1)).toEqual([2, 2, 2]);
  });

  it('preserves order (no sorting)', () => {
    const arcs = allocateSiblingArcs([1, 99], 4, 0.5);
    expect(arcs[0]).toBeLessThan(arcs[1]); // small first stays first
    const swapped = allocateSiblingArcs([99, 1], 4, 0.5);
    expect(swapped[0]).toBeGreaterThan(swapped[1]); // big first stays first
  });

  it('handles a single child', () => {
    expect(allocateSiblingArcs([5], 3.14, 0.1)).toEqual([3.14]);
  });

  it('handles empty input', () => {
    expect(allocateSiblingArcs([], 1, 0.1)).toEqual([]);
  });
});
