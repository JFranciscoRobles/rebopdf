// The package as it goes to npm: `tools/package.mjs` says how.
import { buildPackage } from '../../../tools/package.mjs';

await buildPackage('collab', {
  entries: { index: 'src/index.ts', server: 'src/server.ts', main: 'src/main.ts' },
  exports: { '.': 'index', './server': 'server' },
  bin: { 'rebopdf-collab': 'main' },
  keywords: ['pdf', 'collaboration', 'real-time', 'annotations', 'comments'],
  homepage: 'https://github.com/JFranciscoRobles/rebopdf#readme',
});
