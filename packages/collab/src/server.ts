// The server people meet at to work on a PDF together. Each room is a PDF:
// its file as it was shared, and the operations made on it since, in their
// order. Whoever comes in is given the file and every operation, then each
// one as it is made, and who is in the room and on which page. Kept in
// memory: a room goes when the server does. Everything is under /collab, so
// that it can share an address with the application it works for.
//
//   POST /collab/rooms                 { name, pdf: base64 }   → { room }
//   GET  /collab/rooms/<id>/pdf        the file
//   GET  /collab/rooms/<id>/events?client=…&name=…&color=…     hello, ops, presence, leave
//   POST /collab/rooms/<id>/ops        { client, ops }
//   POST /collab/rooms/<id>/presence   { client, page }

import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { type Op, type Peer, PREFIX } from './protocol';

export interface CollabServerOptions {
  port?: number;
  host?: string;
  /** Asked of whoever shares a PDF (`?token=`), when given: without it anyone who reaches the server can. */
  token?: string;
}

export interface CollabServer {
  /** Answers a request under /collab, inside a server of the application's. */
  handle(request: IncomingMessage, response: ServerResponse): void;
  readonly ready: Promise<void>;
  readonly port: number;
  rooms(): { id: string; name: string; people: string[] }[];
  close(): void;
}

interface Room {
  id: string;
  name: string;
  pdf: Buffer;
  ops: Op[];
  people: Map<string, Peer & { response: ServerResponse }>;
}

/** Most a request may carry: a PDF with its pictures. */
const LIMIT = 96 * 1024 * 1024;

function body(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > LIMIT) {
        reject(new Error('too big'));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export function createCollabServer(options: CollabServerOptions = {}): CollabServer {
  const rooms = new Map<string, Room>();
  const send = (response: ServerResponse, event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const everyone = (room: Room, event: string, data: unknown, but?: string) => {
    for (const [client, person] of room.people) if (client !== but) send(person.response, event, data);
  };
  const peers = (room: Room) => [...room.people.values()].map(({ client, name, color, page }) => ({ client, name, color, page }));
  const json = (response: ServerResponse, status: number, data: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(data));
  };

  function handle(request: IncomingMessage, response: ServerResponse) {
    // Any page may work with the server: what it is given is what its people share.
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'content-type');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const url = new URL(request.url ?? '/', 'http://collab');
    const parts = url.pathname.slice(PREFIX.length).split('/').filter(Boolean);
    if (!url.pathname.startsWith(PREFIX) || parts[0] !== 'rooms') return json(response, 404, { error: 'Not found' });

    if (parts.length === 1 && request.method === 'POST') {
      if (options.token && url.searchParams.get('token') !== options.token) return json(response, 403, { error: 'A token is asked to share a PDF here.' });
      void body(request).then(
        (text) => {
          const { name, pdf } = JSON.parse(text) as { name?: string; pdf?: string };
          if (!pdf) return json(response, 400, { error: 'Give the PDF, as base64.' });
          const id = randomBytes(9).toString('base64url');
          rooms.set(id, { id, name: String(name ?? 'document.pdf'), pdf: Buffer.from(pdf, 'base64'), ops: [], people: new Map() });
          json(response, 201, { room: id });
        },
        () => json(response, 413, { error: 'The PDF is too big.' }),
      );
      return;
    }
    const room = rooms.get(parts[1] ?? '');
    if (!room) return json(response, 404, { error: 'There is no such room.' });
    const what = parts[2];

    if (what === 'pdf' && request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(room.name)}` });
      response.end(room.pdf);
      return;
    }
    if (what === 'events' && request.method === 'GET') {
      const client = url.searchParams.get('client') ?? randomBytes(6).toString('hex');
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      const person = { client, name: url.searchParams.get('name') || 'Someone', color: url.searchParams.get('color') || '#1c5fd6', response };
      room.people.set(client, person);
      send(response, 'hello', { name: room.name, ops: room.ops, peers: peers(room) });
      everyone(room, 'presence', { client, name: person.name, color: person.color }, client);
      const beat = setInterval(() => response.write(': beat\n\n'), 25_000);
      request.on('close', () => {
        clearInterval(beat);
        if (room.people.get(client)?.response === response) room.people.delete(client);
        everyone(room, 'leave', { client });
      });
      return;
    }
    if ((what === 'ops' || what === 'presence') && request.method === 'POST') {
      void body(request).then(
        (text) => {
          const data = JSON.parse(text) as { client?: string; ops?: Op[]; page?: number };
          const person = data.client ? room.people.get(data.client) : undefined;
          if (!person) return json(response, 409, { error: 'Listen to the room first.' });
          if (what === 'ops') {
            const ops = Array.isArray(data.ops) ? data.ops : [];
            room.ops.push(...ops);
            everyone(room, 'ops', { client: person.client, ops }, person.client);
          } else {
            person.page = typeof data.page === 'number' ? data.page : undefined;
            everyone(room, 'presence', { client: person.client, name: person.name, color: person.color, page: person.page }, person.client);
          }
          json(response, 200, { ok: true });
        },
        () => json(response, 400, { error: 'That could not be read.' }),
      );
      return;
    }
    json(response, 404, { error: 'Not found' });
  }

  let server: Server | undefined;
  let port = options.port ?? 0;
  const ready =
    options.port === undefined
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          server = createServer(handle);
          server.listen(options.port, options.host ?? '127.0.0.1', () => {
            const address = server!.address();
            if (address && typeof address === 'object') port = address.port;
            resolve();
          });
        });
  return {
    handle,
    ready,
    get port() {
      return port;
    },
    rooms: () => [...rooms.values()].map((room) => ({ id: room.id, name: room.name, people: [...room.people.values()].map((p) => p.name) })),
    close() {
      for (const room of rooms.values()) for (const person of room.people.values()) person.response.end();
      server?.close();
    },
  };
}
