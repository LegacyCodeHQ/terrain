import { buildTree } from './tree';

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
