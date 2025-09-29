import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const resolvePath = (relativePath: string) => resolve(dirname(fileURLToPath(import.meta.url)), relativePath);
const requireModule = createRequire(import.meta.url);

const hasModule = (specifier: string) => {
  try {
    requireModule.resolve(specifier);
    return true;
  } catch (error) {
    return false;
  }
};

const alias: Record<string, string> = {};

if (!hasModule('@testing-library/react')) {
  alias['@testing-library/react'] = resolvePath('./src/test-utils/testing-library-react.tsx');
}

if (!hasModule('@testing-library/user-event')) {
  alias['@testing-library/user-event'] = resolvePath('./src/test-utils/testing-library-user-event.ts');
}

alias['@textures'] = resolvePath('../../textures');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias,
  },
  server: {
    port: 5173,
    fs: {
      allow: [resolvePath('../..'), resolvePath('../../textures')],
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
  },
});
