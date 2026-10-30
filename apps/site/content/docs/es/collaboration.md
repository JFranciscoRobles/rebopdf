# Colaboración

Varias personas pueden trabajar en un PDF a la vez: las marcas, notas y lo que rellena cada quien se ven al momento, y también quién está en qué página.

## El servidor

```bash
npx rebopdf-collab --port 7460 --store ./rooms
```

O dentro de un servidor tuyo (Express, Nest, el de Node):

```ts
import { createCollabServer } from '@rebopdf/collab/server';

const collab = createCollabServer();
app.use('/collab', (req, res) => collab.handle(req, res));
```

Las salas se guardan en memoria y, con `--store` (`store` en código), en esa carpeta: vuelven a estar cuando el servidor arranca de nuevo, con todo lo que se hizo en ellas.

## En el editor

```ts
import { shareEditor, joinRoom, roomAddress } from '@rebopdf/collab';

const sesion = await shareEditor(editor, { url: 'http://127.0.0.1:7460', name: 'Ana' });
// Tres direcciones para enviar: para editar, para comentar, para ver.
const editar = roomAddress(location.href, sesion, 'edit');
const comentar = roomAddress(location.href, sesion, 'comment');
const ver = roomAddress(location.href, sesion, 'view');
// Los demás, con la sala y la llave de la dirección que recibieron:
await joinRoom(editor, { url: 'http://127.0.0.1:7460', room, key, name: 'Luis' });
```

## Quién puede hacer qué

Una sala tiene tres llaves, y cada dirección lleva una. Quien edita hace todo; quien comenta añade, cambia y responde notas, nada más (el editor le ofrece solo la herramienta de notas, y no rellena el formulario); quien ve no cambia nada. El servidor lo hace cumplir: lo que una llave no permite se rechaza.

## Respuestas e historial

Una nota se responde desde su menú: cada respuesta dice quién y cuándo, y se guarda en el PDF como se guardan las respuestas (anotaciones en respuesta a ella), así otros lectores las muestran debajo. En una sala, Historial de la sala (en el menú, en Herramientas) lista quién hizo qué, y cuándo; en código está en `sesion.history`.

Las páginas van por su número, así que en una sala no se giran, mueven ni borran. Deshacer quita lo que se hizo aquí, no lo que hicieron otros.
