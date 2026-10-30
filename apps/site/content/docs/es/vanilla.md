# Sin framework

```ts
import { mountViewer } from '@rebopdf/viewer';
import { mountEditor } from '@rebopdf/editor';

const visor = mountViewer(elemento, { pdf, locale: 'es' });
const editor = mountEditor(elemento, { pdf, locale: 'es', author: 'Ana' });
```

Los dos ponen sus estilos en la página una sola vez, y toman la altura de lo que los contiene.

## El visor

`mountViewer(elemento, opciones)` acepta `pdf`, `locale`, `theme`, `toolbar`, `thumbnails`, `zoom` (`'auto'`, `'fit-width'`, `'fit-page'` o un número, 1 como impreso), `page`, `download`, `print`, `fill`, `font`, y `onChange` (avisa el PDF al rellenar un campo) y `onPage`.

Da `setPdf`, `goTo`, `goToPlace`, `setZoom`, `zoomAt`, `search`, `openSearch`, `closeSearch`, `setTheme`, `toggleThumbnails`, `download`, `print`, `setRegions` y `destroy`.

## Comparar dos versiones

```ts
import { mountComparison } from '@rebopdf/viewer';

const vista = await mountComparison(elemento, { before: borrador, after: final, locale: 'es', onClose: () => vista.destroy() });
vista.show(0); // el primer cambio
```
