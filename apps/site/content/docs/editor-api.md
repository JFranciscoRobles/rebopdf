# Editor API

`mountEditor(element, options)` gives an `Editor`.

## Options

`pdf`, `locale`, `theme`, `author`, `font`, `thumbnails`, `zoom`, `files` (opening and dropping PDFs), `onChange`, `onSave`, `recognize`, `menu` (items of your own in its menu).

## What it does

- `pdf`, `setPdf(pdf)`, `save(options)`, `undo()`, `redo()`, `setTool(tool)`.
- `highlightSelection(kind)`, `detect()`, `signDigitally()`, `compareWith(file)`, `recognizeText()`.
- `notify(text)`: says something to the person.
- `subscribe(listener)`, `onPage(listener)`, `applyRemote(change)`, `setPeers(peers)`, `lockPages(locked)`: what collaboration uses.
- `viewer`: the viewer it works in.
- `destroy()`.
