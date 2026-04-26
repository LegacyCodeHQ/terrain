import {
  type ArcAllocableNode,
  allocateSiblingArcs,
  buildTree,
  rebalanceArcs,
} from './tree';

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

  it('falls back to proportional (not equal) when donors cannot cover the deficit', () => {
    // Bug observed on clarity-cli/tests: parentArc 0.069, minSweep 0.036,
    // values [373, 90, 82, 21]. The largest's naive share (~0.045) is less
    // than the deficit needed to inflate the three small slices — donors
    // run out. We must fall back to proportional, not equal-split, so the
    // user sees real LOC ratios when they zoom into the directory.
    const arcs = allocateSiblingArcs([373, 90, 82, 21], 0.069, 0.036);
    const total = 566;
    arcs.forEach((arc, i) => {
      const v = [373, 90, 82, 21][i];
      expect(arc).toBeCloseTo((v / total) * 0.069, 4);
    });
  });

  it('returns equal split only when every value is zero', () => {
    // Equal-by-value case — returns equal arcs, but via the total<=0 path,
    // not the old "min cannot fit" fallback.
    const arcs = allocateSiblingArcs([1, 1, 1, 1], 4, 1.5);
    // All values equal → naive proportional is also equal.
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

describe('rebalanceArcs', () => {
  // Sunburst.tsx uses RADIUS = WIDTH / 6 = 928 / 6.
  const RADIUS = 928 / 6;
  const opts = { minSweepPx: 14, radius: RADIUS };

  it('preserves LOC proportions at depth 1 when no slice falls under min', () => {
    // Reproduces the user-reported clarity-cli bug: integration (373) was
    // rendering at ~25% of the circle alongside three siblings with values
    // 21, 82, 90 — instead of the ~66% its LOC share would predict. None of
    // these arcs falls under min sweep at depth 1 (~0.060 rad), so the
    // result should be straight LOC proportions.
    const root: ArcAllocableNode = {
      depth: 0,
      x0: 0,
      x1: 2 * Math.PI,
      children: [
        { depth: 1, x0: 0, x1: 0, value: 373 }, // integration
        { depth: 1, x0: 0, x1: 0, value: 21 }, // litmus
        { depth: 1, x0: 0, x1: 0, value: 82 }, // languagespecs
        { depth: 1, x0: 0, x1: 0, value: 90 }, // internal
      ],
    };
    rebalanceArcs(root, opts);

    const total = 373 + 21 + 82 + 90;
    const arcs = (root.children ?? []).map((c) => c.x1 - c.x0);
    const expected = (root.children ?? []).map(
      (c) => ((c.value ?? 0) / total) * 2 * Math.PI,
    );
    arcs.forEach((arc, i) => {
      expect(arc).toBeCloseTo(expected[i], 4);
    });
  });
});
