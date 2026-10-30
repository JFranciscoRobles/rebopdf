# Forms

## Filling

The fields of a PDF (text, checkboxes, radio buttons, choices, lists) are filled in the page, and saved as a form any reader fills again. In code:

```ts
import { findField, setField } from '@rebopdf/core';

pdf = setField(pdf, 'client.name', 'Ana García');
pdf = setField(pdf, 'accept', true);
findField(pdf, 'plan')?.options; // ['Basic', 'Pro']
```

A field only takes what it can hold: a choice one of its options, a checkbox true or false. Fields are named by their name, or by what the PDF calls them for a person (`label`).

## Making a form

With the tool of fields (F), draw text fields, checkboxes, lists of choices and signature fields on the pages; move and resize them by their boxes; name them, make them required, give a text field several lines.

```ts
import { addField, updateField, removeField } from '@rebopdf/core';

pdf = addField(pdf, { kind: 'text', page: pdf.pages[0].id, rect: { x: 100, y: 700, width: 200, height: 18 }, label: 'Full name', required: true });
pdf = addField(pdf, { kind: 'signature', page: pdf.pages[1].id, rect: { x: 64, y: 200, width: 200, height: 50 }, name: 'Client' });
```

Places are in points from the bottom left of the page, as PDFs have them.

## Fields found by themselves

A PDF with no form often asks for one: `Name: ______`, `☐ I agree`. Find the fields (in the menu of the tool of fields) makes a field of each, named by the words beside it.

```ts
import { detectFields } from '@rebopdf/core';

for (const field of await detectFields(pdf)) pdf = addField(pdf, field);
```
