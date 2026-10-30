# Formularios

## Rellenar

Los campos de un PDF (texto, casillas, botones de opción, listas desplegables y de selección) se rellenan en la página y se guardan como un formulario que cualquier lector vuelve a rellenar. En código:

```ts
import { findField, setField } from '@rebopdf/core';

pdf = setField(pdf, 'client.name', 'Ana García');
pdf = setField(pdf, 'accept', true);
findField(pdf, 'plan')?.options; // ['Básico', 'Pro']
```

Un campo solo acepta lo que puede contener: una lista, una de sus opciones; una casilla, verdadero o falso. Los campos se nombran por su nombre, o por como el PDF los llama para una persona (`label`).

## Crear un formulario

Con la herramienta de campos (F), dibuja campos de texto, casillas, listas de opciones y campos de firma sobre las páginas; muévelos y cambia su tamaño por sus recuadros; nómbralos, hazlos obligatorios, dale varias líneas a un campo de texto.

```ts
import { addField, updateField, removeField } from '@rebopdf/core';

pdf = addField(pdf, { kind: 'text', page: pdf.pages[0].id, rect: { x: 100, y: 700, width: 200, height: 18 }, label: 'Nombre completo', required: true });
pdf = addField(pdf, { kind: 'signature', page: pdf.pages[1].id, rect: { x: 64, y: 200, width: 200, height: 50 }, name: 'Cliente' });
```

Las posiciones van en puntos desde la esquina inferior izquierda de la página, como las tienen los PDF.

## Campos que se encuentran solos

Un PDF sin formulario muchas veces pide uno: `Nombre: ______`, `☐ Acepto`. Detectar campos (en el menú de la herramienta de campos) crea un campo por cada uno, nombrado por las palabras de al lado.

```ts
import { detectFields } from '@rebopdf/core';

for (const campo of await detectFields(pdf)) pdf = addField(pdf, campo);
```
