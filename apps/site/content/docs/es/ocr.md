# Páginas escaneadas (OCR)

Una página escaneada es una imagen: no tiene texto que buscar, seleccionar ni tachar. `@rebopdf/ocr` la lee con [Tesseract](https://github.com/naptha/tesseract.js), en el navegador o en Node.

```bash
npm install @rebopdf/ocr
```

```ts
import { recognizeText } from '@rebopdf/ocr';

pdf = await recognizeText(pdf, { languages: ['spa', 'eng'], onProgress: (hechas, total) => mostrar(hechas, total) });
```

Solo se leen las páginas sin texto propio, salvo que `pages` las nombre. Las palabras se colocan donde se ven: se buscan, seleccionan, resaltan y tachan como texto, y se escriben invisibles sobre las páginas al guardar el PDF.

En el editor, pásale la función y el menú tendrá Reconocer texto:

```ts
mountEditor(elemento, { pdf, recognize: recognizeText });
```

Los datos de cada idioma se descargan la primera vez que hacen falta (`langPath` dice de dónde) y se guardan (`cachePath` en Node). Tesseract puede no leer un título grande junto a una franja oscura de un escaneo.
