# Trabajar en el editor

La barra tiene las herramientas, cada una con su tecla, y actúan sobre las páginas:

| Tecla | Herramienta | Qué hace |
| --- | --- | --- |
| V | Seleccionar y rellenar | Elegir una marca para moverla, cambiarle el color, editarla o borrarla; rellenar el formulario; seleccionar texto. |
| H | Resaltar | Selecciona texto: queda resaltado. |
| N | Nota | Haz clic donde va la nota y escríbela. |
| D | Dibujar | Dibuja con el puntero, el dedo o un lápiz. |
| T | Texto | Haz clic donde va y escríbelo: para rellenar un PDF sin campos. |
| S | Firmar | Dibuja, escribe o sube tu firma, y haz clic donde va. |
| R | Tachar | Dibuja un recuadro sobre lo que debe desaparecer, para siempre. |
| F | Campos de formulario | Dibuja campos de un formulario, muévelos y cambia su tamaño. |

Con Nota, Texto o Firmar, Enter la pone en el centro de la vista: todo se puede hacer con el teclado.

## Marcas

Una marca elegida se mueve arrastrándola o con las flechas (Mayús: de 10 en 10), cambia de tamaño por su esquina, de color, y se borra con Supr. ⌘C la copia, ⌘V la pone en la página a la vista, ⌘D la duplica. Un texto o una firma se pone en todas las páginas a la vez desde su menú: las iniciales en cada hoja de un contrato.

Los resaltados, notas y dibujos que un PDF ya trae, de Acrobat, Vista Previa o cualquier lector, también son marcas.

## Páginas

Las miniaturas del lado actúan sobre las páginas elegidas (un clic; Mayús o ⌘ para más), o sobre la página a la vista: girarlas, borrarlas, añadir una en blanco o guardarlas como un PDF aparte. Arrástralas para moverlas, o usa Alt y las flechas. Suelta un PDF sobre el editor para poner sus páginas después de la que estás viendo.

## El menú

⋯ abre un PDF, añade las páginas de otro, imprime, descarga (o aplanado: campos y marcas dibujados en las páginas), firma digitalmente, compara con otra versión, y lee el texto de las páginas escaneadas cuando el editor recibe `recognize`.

## Deshacer

⌘Z y ⇧⌘Z recorren cada cambio, incluido lo escrito en los campos.

## Protegido con contraseña

Descargar con contraseña… (en el menú ⋯) cifra el PDF con AES-256: solo se abre con la contraseña, y lo que no permite (imprimir, copiar su texto, cambiarlo) los lectores no lo ofrecen. En código:

```ts
const bytes = await savePdf(pdf, { protect: { password: 'abre', permissions: { copying: false } } });
```

`ownerPassword` lo abre para todo; si no se da, nadie puede hacer más de lo que permite la contraseña. Un PDF protegido se abre en ReboPDF pidiéndola.

## Más pequeño

Descargar más pequeño (en el menú ⋯) reduce el PDF: sus imágenes no más grandes de lo que las muestran sus páginas, a 150 puntos por pulgada; las fotografías se escriben otra vez como JPEG; y una imagen o una fuente que tenga dos veces se guarda una sola. Cada cosa se cambia solo si así queda más pequeña. En código, `savePdf(pdf, { optimize: { dpi: 150, quality: 0.75 } })`.

## PDF/A

Descargar como PDF/A (en el menú ⋯) hace un PDF/A-2B, como piden archivos y muchas oficinas guardar documentos: con todas las fuentes que usa dentro (las que solo nombra se toman de las que trae PDF.js, hechas a la medida de las estándar: Liberation Sans para Helvetica y Arial, las de Foxit para Times, Courier, Symbol y ZapfDingbats), sin nada que se ejecute, y con sus colores y metadatos como dice PDF/A. En código, `savePdf(pdf, { pdfa: true })` (o `'3B'`; es 3B por sí solo cuando el PDF trae archivos). En el navegador, las fuentes se descargan de la carpeta dada a `usePdfAssets`.

Para asegurar que un archivo lo acepte, verifícalo con [veraPDF](https://verapdf.org/).

## Marcadores y archivos adjuntos

Junto a las páginas, Índice tiene los marcadores del PDF: en el editor, Añadir un marcador crea uno al lugar que se ve, con su nombre para escribirlo enseguida, y cada uno se puede renombrar, subir y bajar, poner bajo el anterior o sacar de él, y quitar. Archivos tiene los archivos que trae el PDF, cada uno para descargarlo: Adjuntar un archivo agrega más. En código:

```ts
import { setOutline, attachFile, detachFile, outlineOf } from '@rebopdf/core';

let siguiente = setOutline(pdf, [{ title: 'Términos', to: { page: pdf.pages[1].id }, items: [] }]);
siguiente = attachFile(siguiente, { name: 'cuentas.csv', data, mime: 'text/csv' });
```

Los marcadores llevan a las páginas como quedan al guardar; un PDF/A que trae archivos es PDF/A-3.

## El texto de la página, escrito de nuevo

Editar texto (E) reescribe una línea de la página: haz clic en ella, cambia lo que dice (y su letra, si quieres) y Reemplazar. Al guardar el PDF, el texto anterior se quita de lo que dibuja la página, glifo por glifo, conservando el espacio que ocupaba para que el resto de la línea quede donde estaba: no se tapa, desaparece, y ya no se encuentra. El texto nuevo se escribe donde estaba, de su tamaño. En código, una marca de texto con `replaces`:

```ts
addMark(pdf, { kind: 'text', page, rect, text: '1500 pesos', size: 11, color: '#000000', replaces: { rect, text: '1200 pesos' } });
```

El texto dibujado dentro de formularios (XObjects) de la página, o en fuentes de códigos que no sean de uno o dos bytes, se tapa en su lugar.
