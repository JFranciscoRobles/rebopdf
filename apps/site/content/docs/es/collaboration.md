# Colaboración

Varias personas pueden trabajar en un PDF a la vez: las marcas, notas y lo que rellena cada quien se ven al momento, y también quién está en qué página.

## El servidor

```bash
npx rebopdf-collab --port 7460
```

O dentro de un servidor tuyo (Express, Nest, el de Node):

```ts
import { createCollabServer } from '@rebopdf/collab/server';

const collab = createCollabServer();
app.use('/collab', (req, res) => collab.handle(req, res));
```

Las salas se guardan en memoria.

## En el editor

```ts
import { shareEditor, joinRoom } from '@rebopdf/collab';

const sesion = await shareEditor(editor, { url: 'http://127.0.0.1:7460', name: 'Ana' });
// manda sesion.room; los demás:
await joinRoom(editor, { url: 'http://127.0.0.1:7460', room, name: 'Luis' });
```

Las páginas van por su número, así que en una sala no se giran, mueven ni borran. Deshacer quita lo hecho aquí, no lo que hicieron los demás.
