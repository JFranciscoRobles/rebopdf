// The tests of every package, in Node; those of the interface in happy-dom.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**'],
  },
});
