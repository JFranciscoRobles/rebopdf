# Without a framework

```ts
import { mountViewer } from '@rebopdf/viewer';
import { mountEditor } from '@rebopdf/editor';

const viewer = mountViewer(element, { pdf, locale: 'es' });
const editor = mountEditor(element, { pdf, locale: 'es', author: 'Ana' });
```

Both put their styles in the page once, and take the height of what they are in.

## The viewer

`mountViewer(element, options)` takes `pdf`, `locale`, `theme`, `toolbar`, `thumbnails`, `zoom` (`'auto'`, `'fit-width'`, `'fit-page'` or a number, 1 as printed), `page`, `download`, `print`, `fill`, `font`, and `onChange` (told the PDF once a field is filled) and `onPage`.

It gives `setPdf`, `goTo`, `goToPlace`, `setZoom`, `zoomAt`, `search`, `openSearch`, `closeSearch`, `setTheme`, `toggleThumbnails`, `download`, `print`, `setRegions` and `destroy`.

## Comparing two versions

```ts
import { mountComparison } from '@rebopdf/viewer';

const view = await mountComparison(element, { before: draft, after: final, locale: 'es', onClose: () => view.destroy() });
view.show(0); // the first change
```
