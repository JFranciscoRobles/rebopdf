// The package as it goes to npm: `tools/package.mjs` says how.
import { buildPackage } from '../../../tools/package.mjs';

await buildPackage('viewer', {
  entries: { index: 'src/index.ts' },
  exports: { '.': 'index' },
  keywords: ['pdf', 'pdf-viewer', 'viewer', 'thumbnails', 'search', 'forms'],
  homepage: 'https://github.com/JFranciscoRobles/rebopdf#readme',
});
