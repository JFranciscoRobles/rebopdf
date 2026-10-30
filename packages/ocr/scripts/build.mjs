// The package as it goes to npm: `tools/package.mjs` says how.
import { buildPackage } from '../../../tools/package.mjs';

await buildPackage('ocr', {
  entries: { index: 'src/index.ts' },
  exports: { '.': 'index' },
  keywords: ['pdf', 'ocr', 'tesseract', 'scanned', 'text recognition'],
  homepage: 'https://github.com/JFranciscoRobles/rebopdf#readme',
});
