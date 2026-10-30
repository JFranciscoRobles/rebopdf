# Collaboration

Several people can work on one PDF at once: each one's marks, notes and what they fill in are seen by the others as they make them, and who is on which page.

## The server

```bash
npx rebopdf-collab --port 7460
```

Or inside a server of your own (Express, Nest, Node's):

```ts
import { createCollabServer } from '@rebopdf/collab/server';

const collab = createCollabServer();
app.use('/collab', (req, res) => collab.handle(req, res));
```

Rooms are kept in memory.

## In the editor

```ts
import { shareEditor, joinRoom } from '@rebopdf/collab';

const session = await shareEditor(editor, { url: 'http://127.0.0.1:7460', name: 'Ana' });
// send session.room; the others:
await joinRoom(editor, { url: 'http://127.0.0.1:7460', room, name: 'Luis' });
```

Pages go by their number, so in a room pages are not turned, moved or deleted. Undo takes back what was done here, not what others did.
