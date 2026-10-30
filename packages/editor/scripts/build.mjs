// The package as it goes to npm: `tools/package.mjs` says how.
import { buildPackage } from '../../../tools/package.mjs';

await buildPackage('editor', {
  entries: { index: 'src/index.ts' },
  exports: { '.': 'index' },
  keywords: ['pdf', 'pdf-editor', 'annotations', 'highlight', 'signature', 'forms', 'merge'],
  homepage: 'https://github.com/JFranciscoRobles/rebopdf#readme',
});
