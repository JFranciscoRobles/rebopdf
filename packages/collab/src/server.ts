// The server people meet at to work on a PDF together. Each room is a PDF:
// its file as it was shared, and the operations made on it since, in their
// order, each with who made it and when (its history). Whoever comes in is
// given the file and every operation, then each one as it is made, and who
// is in the room and on which page. Everything is under /collab, so that it
// can share an address with the application it works for.
//
// A room has three keys, given to whoever shares it: one to edit, one to
// comment (notes and their replies, nothing else), one to see. Who comes in
// comes with one, and may do what it lets; the server keeps to it. Kept in
// memory, and, given a folder (`store`), on the disk: rooms are there again
// when the server starts again.
//
//   POST /collab/rooms                          { name, pdf: base64 }  → { room, keys }
//   GET  /collab/rooms/<id>/pdf?key=…           the file
//   GET  /collab/rooms/<id>/events?key=…&client=…&name=…&color=…   hello, ops, presence, leave
//   GET  /collab/rooms/<id>/history?key=…       who did what, and when
//   POST /collab/rooms/<id>/ops                 { client, ops }
//   POST /collab/rooms/<id>/presence            { client, page }

import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { type Entry, type Op, type Peer, PREFIX, type Role } from './protocol';

export interface CollabServerOptions {
  port?: number;
  host?: string;
  /** Asked of whoever shares a PDF (`?token=`), when given: without it anyone who reaches the server can. */
  token?: string;
  /** A folder to keep the rooms in, so that they outlive the server. */
  store?: string;
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
  keys: Record<Role, string>;
  entries: Entry[];
  /** The kind and the maker of each mark, as the operations made them: what one who comments may change. */
  marks: Map<string, string>;
  people: Map<string, Peer & { response: ServerResponse; role: Role }>;
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

const key = () => randomBytes(12).toString('base64url');

/** Whether one of a role may make an operation, as the room's marks are. */
function allowed(role: Role, op: Op, marks: Map<string, string>): boolean {
  if (role === 'edit') return true;
  if (role === 'view') return false;
  // Who comments: notes, and their replies.
  if (op.kind === 'mark') return op.mark.kind === 'note' && (marks.get(op.mark.id) ?? 'note') === 'note';
  if (op.kind === 'unmark') return marks.get(op.id) === 'note';
  return false;
}

export function createCollabServer(options: CollabServerOptions = {}): CollabServer {
  const rooms = new Map<string, Room>();
  const send = (response: ServerResponse, event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const everyone = (room: Room, event: string, data: unknown, but?: string) => {
    for (const [client, person] of room.people) if (client !== but) send(person.response, event, data);
  };
  const peers = (room: Room) => [...room.people.values()].map(({ client, name, color, page, role }) => ({ client, name, color, page, role }));
  const json = (response: ServerResponse, status: number, data: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(data));
  };
  const remember = (room: Room, entries: Entry[]) => {
    for (const { op } of entries) {
      if (op.kind === 'mark') room.marks.set(op.mark.id, op.mark.kind);
      else if (op.kind === 'unmark') room.marks.delete(op.id);
    }
  };

  // The rooms kept on the disk.
  const folder = (id: string) => join(options.store!, id);
  if (options.store) {
    mkdirSync(options.store, { recursive: true });
    for (const id of readdirSync(options.store)) {
      try {
        const meta = JSON.parse(readFileSync(join(folder(id), 'room.json'), 'utf8')) as { name: string; keys: Record<Role, string> };
        const lines = existsSync(join(folder(id), 'ops.jsonl'))
          ? readFileSync(join(folder(id), 'ops.jsonl'), 'utf8')
              .split('\n')
              .filter(Boolean)
          : [];
        const room: Room = {
          id,
          name: meta.name,
          keys: meta.keys,
          pdf: readFileSync(join(folder(id), 'document.pdf')),
          entries: lines.map((line) => JSON.parse(line)),
          marks: new Map(),
          people: new Map(),
        };
        remember(room, room.entries);
        rooms.set(id, room);
      } catch {
        // Not a room, or one not whole: left.
      }
    }
  }

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
          const room: Room = {
            id,
            name: String(name ?? 'document.pdf'),
            pdf: Buffer.from(pdf, 'base64'),
            keys: { edit: key(), comment: key(), view: key() },
            entries: [],
            marks: new Map(),
            people: new Map(),
          };
          rooms.set(id, room);
          if (options.store) {
            mkdirSync(folder(id), { recursive: true });
            writeFileSync(join(folder(id), 'document.pdf'), room.pdf);
            writeFileSync(join(folder(id), 'room.json'), JSON.stringify({ name: room.name, keys: room.keys, created: new Date().toISOString() }));
          }
          json(response, 201, { room: id, keys: room.keys });
        },
        () => json(response, 413, { error: 'The PDF is too big.' }),
      );
      return;
    }
    const room = rooms.get(parts[1] ?? '');
    if (!room) return json(response, 404, { error: 'There is no such room.' });
    const what = parts[2];
    const roleOf = (given: string | null) => (Object.entries(room.keys).find(([, k]) => k === given)?.[0] as Role | undefined) ?? undefined;

    if ((what === 'pdf' || what === 'events' || what === 'history') && request.method === 'GET') {
      const role = roleOf(url.searchParams.get('key'));
      if (!role) return json(response, 403, { error: 'This room asks for the key of its address.' });
      if (what === 'pdf') {
        response.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(room.name)}` });
        response.end(room.pdf);
        return;
      }
      if (what === 'history') return json(response, 200, { entries: room.entries });
      const client = url.searchParams.get('client') ?? randomBytes(6).toString('hex');
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      const person = { client, name: url.searchParams.get('name') || 'Someone', color: url.searchParams.get('color') || '#1c5fd6', response, role };
      room.people.set(client, person);
      send(response, 'hello', { name: room.name, role, entries: room.entries, peers: peers(room) });
      everyone(room, 'presence', { client, name: person.name, color: person.color, role }, client);
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
            const refused = ops.filter((op) => !allowed(person.role, op, room.marks));
            if (refused.length) return json(response, 403, { error: person.role === 'view' ? 'Who sees a room changes nothing in it.' : 'Who comments adds and changes notes alone.' });
            const at = new Date().toISOString();
            const entries: Entry[] = ops.map((op) => ({ op, by: person.name, color: person.color, at }));
            room.entries.push(...entries);
            remember(room, entries);
            if (options.store) appendFileSync(join(folder(room.id), 'ops.jsonl'), entries.map((e) => `${JSON.stringify(e)}\n`).join(''));
            everyone(room, 'ops', { client: person.client, entries }, person.client);
          } else {
            person.page = typeof data.page === 'number' ? data.page : undefined;
            everyone(room, 'presence', { client: person.client, name: person.name, color: person.color, page: person.page, role: person.role }, person.client);
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
