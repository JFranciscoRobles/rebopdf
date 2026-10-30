# API del editor

`mountEditor(elemento, opciones)` da un `Editor`.

## Opciones

`pdf`, `locale`, `theme`, `author`, `font`, `thumbnails`, `zoom`, `files` (abrir y soltar PDF), `onChange`, `onSave`, `recognize`, `menu` (elementos propios en su menú).

## Qué hace

- `pdf`, `setPdf(pdf)`, `save(opciones)`, `undo()`, `redo()`, `setTool(herramienta)`.
- `highlightSelection(tipo)`, `detect()`, `signDigitally()`, `compareWith(archivo)`, `recognizeText()`.
- `notify(texto)`: le dice algo a la persona.
- `subscribe(oyente)`, `onPage(oyente)`, `applyRemote(cambio)`, `setPeers(personas)`, `lockPages(bloqueadas)`: lo que usa la colaboración.
- `viewer`: el visor en el que trabaja.
- `destroy()`.
