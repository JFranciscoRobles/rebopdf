// The package as it goes to npm: `tools/package.mjs` says how.
import { buildPackage } from '../../../tools/package.mjs';

await buildPackage('mcp', {
  entries: { index: 'src/tools.ts', server: 'src/server.ts', main: 'src/main.ts' },
  exports: { '.': 'index', './server': 'server' },
  bin: { 'rebopdf-mcp': 'main' },
  node: true,
  keywords: ['mcp', 'model-context-protocol', 'ai', 'assistant', 'claude', 'pdf', 'forms', 'signature'],
  homepage: 'https://github.com/JFranciscoRobles/rebopdf#readme',
});
