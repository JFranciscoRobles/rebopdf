import { addMark, type Pdf, removeMark, samplePdf, setField } from '@rebopdf/core';
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyOps, type CollabEditor, describeOp, diffPdfs, joinRoom, type Role, shareEditor } from '../src';
import { createCollabServer } from '../src/server';

/** An editor as a room sees it: the PDF, and what is done to it. */
function editor(start?: Pdf) {
  let pdf = start;
  const listeners = new Set<(pdf: Pdf, remote: boolean) => void>();
  const pages = new Set<(page: string) => void>();
  const state = { peers: [] as { name: string; page?: string }[], locked: false, role: 'edit' as Role };
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
    setRole(role) {
      state.role = role;
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
    const luisRoom = await joinRoom(luis, { url, room: anaRoom.room, key: anaRoom.keys!.edit, name: 'Luis' });
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

  it('lets who comments add notes alone, who sees change nothing, and keeps who did what', async () => {
    await server.ready;
    const url = `http://127.0.0.1:${server.port}`;
    const ana = editor(await samplePdf('en'));
    const room = await shareEditor(ana, { url, name: 'Ana' });
    expect(room.role).toBe('edit');
    const eva = editor();
    const evaRoom = await joinRoom(eva, { url, room: room.room, key: room.keys!.comment, name: 'Eva' });
    const leo = editor();
    const leoRoom = await joinRoom(leo, { url, room: room.room, key: room.keys!.view, name: 'Leo' });
    await until(() => eva.state.role === 'comment' && leo.state.role === 'view');
    // Ana highlights; Eva notes; both are heard.
    const ap = ana.pdf!;
    ana.change(addMark(ap, { kind: 'highlight', page: ap.pages[0].id, rects: [{ x: 64, y: 700, width: 80, height: 12 }], color: '#ffe066' }));
    await until(() => eva.pdf?.marks.length === 1 && leo.pdf?.marks.length === 1);
    const ep = eva.pdf!;
    eva.change(addMark(ep, { kind: 'note', page: ep.pages[0].id, at: { x: 300, y: 600 }, text: 'Por qué?', color: '#f08c00', author: 'Eva' }));
    await until(() => ana.pdf!.marks.length === 2);
    // What a role does not let is refused by the server: Eva's field, Eva taking off the highlight, Leo's note.
    const refused = async (key: string, client: { pdf?: unknown }, ops: unknown[]) => {
      void client;
      const events = await fetch(`${url}/collab/rooms/${room.room}/events?key=${key}&client=probe-${key.slice(0, 4)}&name=Probe`);
      await new Promise((r) => setTimeout(r, 50));
      const answer = await fetch(`${url}/collab/rooms/${room.room}/ops`, { method: 'POST', body: JSON.stringify({ client: `probe-${key.slice(0, 4)}`, ops }) });
      await events.body?.cancel();
      return answer.status;
    };
    expect(await refused(room.keys!.comment, eva, [{ kind: 'field', name: 'client.name', value: 'X' }])).toBe(403);
    expect(await refused(room.keys!.comment, eva, [{ kind: 'unmark', id: ana.pdf!.marks[0].id }])).toBe(403);
    expect(await refused(room.keys!.view, leo, [{ kind: 'mark', page: 0, mark: { kind: 'note', id: 'x', at: { x: 1, y: 1 }, text: 'no', color: '#000' } }])).toBe(403);
    // Without its key, no one comes in.
    expect((await fetch(`${url}/collab/rooms/${room.room}/pdf`)).status).toBe(403);
    // Who did what, in its order, to all of them.
    await until(() => leo.pdf?.marks.length === 2);
    expect(leoRoom.history.map((e) => [e.by, describeOp(e.op)])).toEqual([
      ['Ana', 'put or changed a highlight on page 1'],
      ['Eva', 'put or changed a note on page 1'],
    ]);
    expect(room.history.map((e) => e.by)).toEqual(['Ana', 'Eva']);
    evaRoom.close();
    leoRoom.close();
    room.close();
  });

  it('keeps its rooms on the disk, for when it starts again', async () => {
    const store = await mkdtemp(join(tmpdir(), 'rebopdf-rooms-'));
    const first = createCollabServer({ port: 0, store });
    await first.ready;
    const ana = editor(await samplePdf('en'));
    const room = await shareEditor(ana, { url: `http://127.0.0.1:${first.port}`, name: 'Ana' });
    const ap = ana.pdf!;
    ana.change(addMark(ap, { kind: 'note', page: ap.pages[1].id, at: { x: 100, y: 500 }, text: 'Kept', color: '#1c5fd6' }));
    await until(() => room.history.length === 1);
    await new Promise((r) => setTimeout(r, 300));
    room.close();
    first.close();
    // Another server, of the same folder: the room, its file and what was done in it.
    const second = createCollabServer({ port: 0, store });
    await second.ready;
    const luis = editor();
    const again = await joinRoom(luis, { url: `http://127.0.0.1:${second.port}`, room: room.room, key: room.keys!.edit, name: 'Luis' });
    await until(() => luis.pdf?.marks.length === 1);
    expect(luis.pdf!.marks[0]).toMatchObject({ kind: 'note', text: 'Kept' });
    expect(again.history[0]).toMatchObject({ by: 'Ana' });
    again.close();
    second.close();
  });
});
