# Collaboration

Several people can work on one PDF at once: each one's marks, notes and what they fill in are seen by the others as they make them, and who is on which page.

## The server

```bash
npx rebopdf-collab --port 7460 --store ./rooms
```

Or inside a server of your own (Express, Nest, Node's):

```ts
import { createCollabServer } from '@rebopdf/collab/server';

const collab = createCollabServer();
app.use('/collab', (req, res) => collab.handle(req, res));
```

Rooms are kept in memory, and, with `--store` (`store` in code), in that folder: they are there again when the server starts again, with all that was done in them.

## In the editor

```ts
import { shareEditor, joinRoom, roomAddress } from '@rebopdf/collab';

const session = await shareEditor(editor, { url: 'http://127.0.0.1:7460', name: 'Ana' });
// Three addresses to send: to edit, to comment, to see.
const edit = roomAddress(location.href, session, 'edit');
const comment = roomAddress(location.href, session, 'comment');
const view = roomAddress(location.href, session, 'view');
// The others, with the room and the key of the address they were sent:
await joinRoom(editor, { url: 'http://127.0.0.1:7460', room, key, name: 'Luis' });
```

## Who may do what

A room has three keys, and each address carries one. Who edits does everything; who comments adds, changes and replies to notes, nothing else (the editor offers the note tool alone, and its form is not filled); who sees changes nothing. The server keeps to it: what a key does not let is refused.

## Replies and history

A note is answered from its menu: each reply says who and when, and is saved in the PDF as replies are (annotations in reply to it), so other readers show them under it. In a room, History of the room (in the menu, under Tools) lists who did what, and when; `session.history` has it in code.

Pages go by their number, so in a room pages are not turned, moved or deleted. Undo takes back what was done here, not what others did.
