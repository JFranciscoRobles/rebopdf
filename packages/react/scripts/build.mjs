// The package as it goes to npm: `tools/package.mjs` says how.
import { buildPackage } from '../../../tools/package.mjs';

await buildPackage('react', {
  entries: { index: 'src/index.ts' },
  exports: { '.': 'index' },
  client: ['index'],
  keywords: ['pdf', 'react', 'pdf-viewer', 'pdf-editor', 'forms', 'signature'],
  homepage: 'https://github.com/JFranciscoRobles/rebopdf#readme',
});
