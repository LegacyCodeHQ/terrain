import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Externalize bare module specifiers so Electron's main process require()s them
// at runtime (it has full node_modules access).
function externalizeNodeModules(): Plugin {
  return {
    name: 'externalize-node-modules',
    enforce: 'pre',
    resolveId(source) {
      if (
        !source.startsWith('.') &&
        !source.startsWith('/') &&
        !source.startsWith('@/')
      ) {
        return { id: source, external: true };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [externalizeNodeModules()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
