// An editor in a room: what its person changes sent to the others as it is
// made, what they change made on it, and who is in the room and on which
// page shown. Sharing starts a room with the PDF as it is (its file without
// its marks, and its marks as the first operations); joining opens the
// room's file and makes on it what was done in the room until then.

import { type Mark, openPdf, type Pdf, savePdf } from '@rebopdf/core';
import { applyOps, diffPdfs, type Op, type Peer, PREFIX } from './protocol';

/** What of an editor (of @rebopdf/editor) a room needs. */
export interface CollabEditor {
  readonly pdf: Pdf | undefined;
  setPdf(pdf: Pdf): void;
  subscribe(listener: (pdf: Pdf, remote: boolean) => void): () => void;
  onPage(listener: (page: string) => void): () => void;
  applyRemote(change: (pdf: Pdf) => Pdf): void;
  setPeers(peers: { name: string; color: string; page?: string }[]): void;
  lockPages(locked: boolean): void;
}

export interface RoomOptions {
  /** Where the server is, as "http://127.0.0.1:7460". */
  url: string;
  /** Who is working: as the others see it. */
  name: string;
  color?: string;
  /** Asked by a server to share a PDF on it. */
  token?: string;
}

export interface Session {
  readonly room: string;
  /** The others in the room now. */
  readonly peers: Peer[];
  /** Told the others in the room, as they come, go and move. */
  onPeers?: (peers: Peer[]) => void;
  /** Leaves the room: the editor works on alone. */
  close(): void;
}

const COLORS = ['#e8590c', '#2f9e44', '#1c5fd6', '#ae3ec9', '#c2255c', '#0c8599', '#f08c00'];
const toBase64 = (bytes: Uint8Array) => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

/** The operations a PDF's marks are, to start a room with. */
const marksAsOps = (pdf: Pdf): Op[] =>
  pdf.marks.flatMap((mark): Op[] => {
    const page = pdf.pages.findIndex((p) => p.id === mark.page);
    const { page: _, ...rest } = mark as Mark;
    return page < 0 ? [] : [{ kind: 'mark', page, mark: rest }];
  });

/** Starts a room with the PDF of the editor, and works in it. */
export async function shareEditor(editor: CollabEditor, options: RoomOptions): Promise<Session> {
  const pdf = editor.pdf;
  if (!pdf) throw new Error('There is no PDF to share.');
  // The file without its marks: they go as operations, with ids every person keeps.
  const base = await savePdf({ ...pdf, marks: [] });
  const response = await fetch(`${options.url}${PREFIX}/rooms${options.token ? `?token=${encodeURIComponent(options.token)}` : ''}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: pdf.name, pdf: toBase64(base) }),
  });
  if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `The server said ${response.status}.`);
  const { room } = (await response.json()) as { room: string };
  const opened = await openPdf(base, { name: pdf.name, marks: false });
  const ops = marksAsOps(pdf);
  editor.setPdf(applyOps(opened, ops));
  return connect(editor, room, options, ops);
}

/** Opens the PDF of a room in the editor, and works in it. */
export async function joinRoom(editor: CollabEditor, options: RoomOptions & { room: string }): Promise<Session> {
  const response = await fetch(`${options.url}${PREFIX}/rooms/${encodeURIComponent(options.room)}/pdf`);
  if (!response.ok) throw new Error('There is no such room.');
  const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'document.pdf');
  editor.setPdf(await openPdf(new Uint8Array(await response.arrayBuffer()), { name, marks: false }));
  return connect(editor, options.room, options, []);
}

/** Listens to a room and sends to it: the operations of the editor, as they are made, and the page in view. */
function connect(editor: CollabEditor, room: string, options: RoomOptions, first: Op[]): Session {
  const client = Math.random().toString(36).slice(2, 12);
  const color = options.color ?? COLORS[Math.floor(Math.random() * COLORS.length)];
  const base = `${options.url}${PREFIX}/rooms/${encodeURIComponent(room)}`;
  const peers = new Map<string, Peer>();
  let last = editor.pdf!;
  let pending: Op[] = [...first];
  let closed = false;
  let listening = false;
  const abort = new AbortController();

  const showPeers = () => {
    const pdf = editor.pdf;
    const list = [...peers.values()];
    editor.setPeers(list.map((p) => ({ name: p.name, color: p.color, page: p.page === undefined ? undefined : pdf?.pages[p.page]?.id })));
    session.onPeers?.(list);
  };
  const post = (what: string, data: object) =>
    fetch(`${base}/${what}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client, ...data }) }).catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (!listening || !pending.length) return;
    const ops = pending;
    pending = [];
    void post('ops', { ops });
  };
  const queue = (ops: Op[]) => {
    pending.push(...ops);
    clearTimeout(timer);
    timer = setTimeout(flush, 120);
  };

  editor.lockPages(true);
  const unsubscribe = editor.subscribe((pdf, remote) => {
    if (!remote) {
      const ops = diffPdfs(last, pdf);
      if (ops.length) queue(ops);
    }
    last = pdf;
  });
  let page: ReturnType<typeof setTimeout> | undefined;
  const unpage = editor.onPage((id) => {
    clearTimeout(page);
    page = setTimeout(() => {
      const n = editor.pdf?.pages.findIndex((p) => p.id === id) ?? -1;
      if (n >= 0 && listening) void post('presence', { page: n });
    }, 250);
  });

  const events = (event: string, data: Record<string, unknown>) => {
    if (event === 'hello') {
      const ops = data.ops as Op[];
      if (ops.length) editor.applyRemote((pdf) => applyOps(pdf, ops));
      for (const peer of data.peers as Peer[]) if (peer.client !== client) peers.set(peer.client, peer);
      listening = true;
      flush();
      showPeers();
    } else if (event === 'ops' && data.client !== client) {
      const ops = data.ops as Op[];
      editor.applyRemote((pdf) => applyOps(pdf, ops));
      showPeers();
    } else if (event === 'presence' && data.client !== client) {
      peers.set(data.client as string, data as unknown as Peer);
      showPeers();
    } else if (event === 'leave') {
      peers.delete(data.client as string);
      showPeers();
    }
  };

  // The stream of the room, read with fetch (in browsers and in Node alike); heard again after it breaks.
  const listen = async () => {
    while (!closed) {
      try {
        const query = new URLSearchParams({ client, name: options.name, color });
        const response = await fetch(`${base}/events?${query}`, { signal: abort.signal });
        if (!response.body) throw new Error('No stream');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end = buffer.indexOf('\n\n');
          while (end >= 0) {
            const chunk = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const event = /^event: (.*)$/m.exec(chunk)?.[1];
            const data = /^data: (.*)$/m.exec(chunk)?.[1];
            if (event && data) events(event, JSON.parse(data));
            end = buffer.indexOf('\n\n');
          }
        }
      } catch {
        if (closed) return;
      }
      listening = false;
      if (!closed) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };
  void listen();

  const session: Session = {
    room,
    get peers() {
      return [...peers.values()];
    },
    close() {
      closed = true;
      flush();
      abort.abort();
      unsubscribe();
      unpage();
      editor.lockPages(false);
      editor.setPeers([]);
    },
  };
  return session;
}
