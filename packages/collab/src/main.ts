// Runs the room server, for people to work on PDFs together.
//
//   rebopdf-collab [--port 7460] [--host 127.0.0.1] [--token secret] [--store ./rooms]
//
// Rooms are kept in memory, and, with --store, in that folder: they are there
// again when the server starts again.

import { createCollabServer } from './server';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const port = Number(flag('port') ?? 7460);
const server = createCollabServer({ port, host: flag('host') ?? '127.0.0.1', token: flag('token'), store: flag('store') });
await server.ready;
console.error(`rebopdf-collab: http://${flag('host') ?? '127.0.0.1'}:${server.port}/collab`);
