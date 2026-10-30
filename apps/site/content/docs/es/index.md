# Qué es ReboPDF

ReboPDF pone los PDF en tu aplicación: léelos, búscalos, rellena y crea sus formularios, resalta, anota, dibuja y escribe sobre ellos, fírmalos (con una imagen de tu firma, o digitalmente con un certificado), tacha para siempre lo privado, gira, mueve, borra y une sus páginas, compara dos versiones, lee el texto de los escaneos y trabaja en uno con otras personas a la vez. Lo hecho se guarda como un PDF que cualquier lector abre.

Corre en el navegador: el PDF no se envía a ningún lado. El motor corre también en Node, para un servidor que rellene, firme o tache PDF, y un servidor MCP deja que los asistentes de IA hagan todo eso.

## De qué está hecho

| Paquete | Qué es |
| --- | --- |
| `@rebopdf/core` | El motor, sin DOM: un PDF abierto, cambiado, firmado, comparado y guardado, su texto leído y buscado. |
| `@rebopdf/viewer` | El visor: páginas, miniaturas, índice, enlaces, búsqueda, formularios para rellenar. |
| `@rebopdf/editor` | El editor: el visor con herramientas, páginas, archivos, historial, firmas, comparación. |
| `@rebopdf/react` | `PdfViewer`, `PdfEditor`, `usePdf`. |
| `@rebopdf/collab` | Varias personas en un PDF a la vez. |
| `@rebopdf/ocr` | El texto de las páginas escaneadas, con Tesseract. |
| `@rebopdf/mcp` | 29 herramientas para asistentes de IA. |

## Cómo lee y escribe los PDF

[PDF.js](https://mozilla.github.io/pdf.js/), el lector de Mozilla, dibuja las páginas y lee su texto; [pdf-lib](https://github.com/cantoo-scribe/pdf-lib) escribe el archivo. Lo que ReboPDF añade es el resto: el modelo de lo que se le hace a un PDF, la apariencia de cada anotación, firmar y verificar firmas, el tachado, la interfaz, la colaboración y los asistentes.

Es hermano de [Rebodocs](https://rebodocs.com), Rebosheets, ReboSlides, ReboFiles, Rebomail y ReboNotes, con el mismo aspecto.
