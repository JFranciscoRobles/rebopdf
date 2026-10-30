// The package as it goes to npm: `tools/package.mjs` says how.
import { buildPackage } from '../../../tools/package.mjs';

await buildPackage('core', {
  entries: { index: 'src/index.ts' },
  exports: { '.': 'index' },
  keywords: ['pdf', 'pdf-editor', 'forms', 'annotations', 'signature', 'merge', 'split'],
  homepage: 'https://github.com/JFranciscoRobles/rebopdf#readme',
});
