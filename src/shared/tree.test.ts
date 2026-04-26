import { buildTree } from './tree';

describe('buildTree', () => {
  it('returns a root with no children for empty input', () => {
    expect(buildTree('repo', [])).toEqual({ name: 'repo', children: [] });
  });

  it('builds a single-level tree for top-level files', () => {
    const tree = buildTree('repo', ['README.md', 'LICENSE']);
    expect(tree).toEqual({
      name: 'repo',
      children: [
        { name: 'README.md', value: 1 },
        { name: 'LICENSE', value: 1 },
      ],
    });
  });

  it('nests directories from path segments', () => {
    const tree = buildTree('repo', [
      'src/main/main.ts',
      'src/main/preload.ts',
      'src/renderer/App.tsx',
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
                { name: 'main.ts', value: 1 },
                { name: 'preload.ts', value: 1 },
              ],
            },
            {
              name: 'renderer',
              children: [{ name: 'App.tsx', value: 1 }],
            },
          ],
        },
      ],
    });
  });

  it('skips empty path entries', () => {
    const tree = buildTree('repo', ['', 'a.txt']);
    expect(tree.children).toEqual([{ name: 'a.txt', value: 1 }]);
  });
});
