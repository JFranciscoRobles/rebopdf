# Tachado

Tapar texto con un recuadro negro no lo saca de un PDF: sigue ahí para copiarlo. Tachar con ReboPDF sí lo saca.

Dibuja recuadros con la herramienta Tachar (R), o selecciona texto y elige Tachar. Al guardar el PDF:

- La página se dibuja como una imagen, incluido lo que tienen sus campos, y los recuadros quedan quemados en ella.
- La imagen es todo lo que la página es: lo que había bajo los recuadros (texto, imágenes, dibujos, valores de campos) no está en ningún lugar del archivo.
- El texto fuera de los recuadros se escribe sobre la imagen, invisible, para que la página se pueda buscar y seleccionar como antes.
- Los enlaces y marcas bajo un recuadro se van con él; la estructura etiquetada del PDF, que guarda copias de su texto, se elimina.

Antes de guardar, lo tachado ya no se encuentra en las búsquedas. Una vez guardado, el editor muestra el PDF tal como quedó.

```ts
import { addMark, searchPdf, savePdf } from '@rebopdf/core';

for (const encontrado of await searchPdf(pdf, 'ACC-2026-0042'))
  pdf = addMark(pdf, { kind: 'redaction', page: encontrado.page, rects: encontrado.rects });
const seguro = await savePdf(pdf);
```

Un PDF con algo tachado nunca se guarda añadiendo a su archivo: eso dejaría el original dentro.
