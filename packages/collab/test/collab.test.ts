import { addMark, type Pdf, removeMark, samplePdf, setField } from '@rebopdf/core';
import { afterAll, describe, expect, it } from 'vitest';
import { applyOps, type CollabEditor, diffPdfs, joinRoom, shareEditor } from '../src';
import { createCollabServer } from '../src/server';

/** An editor as a room sees it: the PDF, and what is done to it. */
function editor(start?: Pdf) {
  let pdf = start;
  const listeners = new Set<(pdf: Pdf, remote: boolean) => void>();
  const pages = new Set<(page: string) => void>();
  const state = { peers: [] as { name: string; page?: string }[], locked: false };
  const self: CollabEditor & { change(next: Pdf): void; go(page: string): void; state: typeof state } = {
    get pdf() {
      return pdf;
    },
    setPdf(next) {
      pdf = next;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onPage(listener) {
      pages.add(listener);
      return () => pages.delete(listener);
    },
    applyRemote(change) {
      pdf = change(pdf!);
      for (const l of listeners) l(pdf, true);
    },
    setPeers(peers) {
      state.peers = peers;
    },
    lockPages(locked) {
      state.locked = locked;
    },
    change(next) {
      pdf = next;
      for (const l of listeners) l(next, false);
    },
    go(page) {
      for (const l of pages) l(page);
    },
    state,
  };
  return self;
}

const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('Waited too long');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const server = createCollabServer({ port: 0 });
afterAll(() => server.close());

describe('the operations of a room', () => {
  it('say what changed of the marks and the form, and make it on another Pdf', async () => {
    const before = await samplePdf('en');
    let after = addMark(before, { kind: 'note', page: before.pages[1].id, at: { x: 1, y: 2 }, text: 'Hi', color: '#000000' });
    after = setField(after, 'plan', 'Business');
    const ops = diffPdfs(before, after);
    expect(ops.map((o) => o.kind)).toEqual(['mark', 'field']);
    expect(ops[0]).toMatchObject({ page: 1 });
    // Made on the same file opened by someone else, with ids of its own.
    const other = await samplePdf('en');
    const made = applyOps(other, ops);
    expect(made.marks[0]).toMatchObject({ page: other.pages[1].id, text: 'Hi', id: after.marks[0].id });
    expect(made.fields.find((f) => f.name === 'plan')?.value).toBe('Business');
    expect(applyOps(made, diffPdfs(after, removeMark(after, after.marks[0].id))).marks).toEqual([]);
  });
});

describe('a room', () => {
  it('gives each person what the others do, as they do it', async () => {
    await server.ready;
    const url = `http://127.0.0.1:${server.port}`;
    let start = await samplePdf('en');
    start = addMark(start, { kind: 'highlight', page: start.pages[0].id, rects: [{ x: 64, y: 700, width: 100, height: 12 }], color: '#ffe066', comment: 'Before sharing' });
    const ana = editor(start);
    const anaRoom = await shareEditor(ana, { url, name: 'Ana', color: '#e8590c' });
    expect(ana.state.locked).toBe(true);
    expect(ana.pdf!.marks).toHaveLength(1);

    const luis = editor();
    const luisRoom = await joinRoom(luis, { url, room: anaRoom.room, name: 'Luis' });
    // What was there before Luis came, he is given.
    await until(() => (luis.pdf?.marks.length ?? 0) === 1);
    expect(luis.pdf!.marks[0]).toMatchObject({ kind: 'highlight', comment: 'Before sharing', id: ana.pdf!.marks[0].id });
    await until(() => ana.state.peers.some((p) => p.name === 'Luis'));

    // Luis puts a note on page 2 and fills a field: Ana sees both.
    const lp = luis.pdf!;
    luis.change(setField(addMark(lp, { kind: 'note', page: lp.pages[1].id, at: { x: 100, y: 500 }, text: 'From Luis', color: '#1c5fd6' }), 'client.name', 'Luis Pérez'));
    await until(() => ana.pdf!.marks.length === 2 && ana.pdf!.fields.find((f) => f.name === 'client.name')?.value === 'Luis Pérez');
    expect(ana.pdf!.marks[1]).toMatchObject({ page: ana.pdf!.pages[1].id, text: 'From Luis' });

    // Ana takes the highlight off: Luis sees it go. And where she is.
    ana.change(removeMark(ana.pdf!, ana.pdf!.marks[0].id));
    await until(() => luis.pdf!.marks.length === 1);
    ana.go(ana.pdf!.pages[1].id);
    await until(() => luis.state.peers.some((p) => p.name === 'Ana' && p.page === luis.pdf!.pages[1].id));

    expect(server.rooms()).toEqual([{ id: anaRoom.room, name: 'Service agreement.pdf', people: ['Ana', 'Luis'] }]);
    luisRoom.close();
    await until(() => !ana.state.peers.length);
    expect(luis.state.locked).toBe(false);
    anaRoom.close();
  });
});
