// A Model Context Protocol server for PDFs: what an assistant talks to. It
// speaks JSON-RPC, a message a line, and offers the tools of `tools.ts` on
// the PDF files it is asked to open, each kept in memory until it is saved.
// Node only; `main.ts` runs it.

import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { checkSignatures, comparePdfs, extractPages, insertPdf, openPdf, type Pdf, PdfError, savePdf, savesIncrementally, signPdf, whyNotIncremental } from '@rebopdf/core';
import { version } from '../package.json';
import { type Files, findTool, pagesOf, type Tool, TOOLS, ToolError } from './tools';

export interface ServerOptions {
  /** Folders that may be opened and written; anywhere, when none is given. */
  roots?: string[];
  /** Where relative paths start. */
  cwd?: string;
  /** A TrueType or OpenType font file to write text in, for letters the standard font of PDFs has not. */
  font?: string;
}

interface Message {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface Open {
  file: string;
  pdf: Pdf;
  unsaved: boolean;
  /** The PDF before each change of the tools: what undo takes back. */
  history: Pdf[];
}

const HISTORY = 30;
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `Tools to read and change PDF files. To take private text out of a PDF, black it out with redact_text or redact_area: when saved, it is gone from the file, not only covered. Open one with open_pdf, read it with read_pdf, find text with search_pdf. Fill its form with list_fields and fill_fields; highlight text, add notes, write on it and sign it; turn, delete, move, join and take out pages. Pages go by number from 1 ("1,3-5"); places by points from the top left of a page, or by a text of the page with "near". Changes stay in memory until save_pdf, which writes a copy unless it is told the file to write. To sign, use only a picture of a signature the person gives, when that person asks.`;

const DOCUMENT = { type: 'string', description: 'The path of a PDF opened with open_pdf. Left out, the last one opened.' };

const OWN: (Omit<Tool, 'run' | 'writes'> & { annotations: Record<string, boolean> })[] = [
  {
    name: 'open_pdf',
    title: 'Open a PDF',
    annotations: { readOnlyHint: true },
    description: 'Opens a PDF file to work on. Kept in memory: nothing is written until save_pdf. Says how many pages it has, its form fields and what it says of itself.',
    properties: { file: { type: 'string', description: 'The path of the PDF.' }, password: { type: 'string', description: 'For a PDF that asks for one.' } },
    required: ['file'],
  },
  {
    name: 'save_pdf',
    title: 'Save a PDF',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    description:
      'Writes a PDF as it is now: to `file`, or, when left out, to a copy beside it ("contract (edited).pdf"). The form stays a form and highlights and notes stay annotations, unless `flatten`, which draws them into the pages for good.',
    properties: {
      document: DOCUMENT,
      file: { type: 'string', description: 'Where to write it. Its own file is written over only when named here.' },
      flatten: { type: 'boolean', description: 'Draws fields and marks into the pages.' },
    },
  },
  {
    name: 'merge_pdfs',
    title: 'Join PDFs',
    annotations: { readOnlyHint: true },
    description: 'Puts the pages of another PDF file into the one open: at the end, or before a page.',
    properties: {
      document: DOCUMENT,
      file: { type: 'string', description: 'The path of the PDF whose pages go in.' },
      before: { type: 'integer', minimum: 1, description: 'The page they go before. The end when left out.' },
    },
    required: ['file'],
  },
  {
    name: 'extract_pages',
    title: 'Save pages as a PDF',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    description: 'Writes some pages of the PDF, with what is on them, as a PDF of their own. The PDF open stays as it is.',
    properties: { document: DOCUMENT, pages: { type: 'string', description: 'Pages by number: "3", "1,3-5".' }, file: { type: 'string', description: 'Where to write the new PDF.' } },
    required: ['pages', 'file'],
  },
  {
    name: 'sign_digitally',
    title: 'Sign digitally',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    description:
      'Signs a PDF with a certificate of the person, as readers of signatures check them, and writes it signed: to `file`, or to a copy beside it ("contract (signed).pdf"). The certificate is a .p12 or .pfx file and its password, or a .cer (or .crt, .pem) and its .key with the password of the key, as Mexico\'s e.firma comes. Signatures it had still hold. Only when the person whose certificate it is asks for it.',
    properties: {
      document: DOCUMENT,
      certificate: { type: 'string', description: 'The path of the .p12, .pfx, .cer, .crt or .pem file.' },
      key: { type: 'string', description: 'With a .cer: the path of its .key.' },
      password: { type: 'string', description: 'The password of the certificate, or of its key.' },
      field: { type: 'string', description: 'A signature field of the PDF to sign in (list_fields gives them). Left out, the signature is not seen on the pages.' },
      reason: { type: 'string', description: 'Why it is signed.' },
      location: { type: 'string', description: 'Where it is signed.' },
      file: { type: 'string', description: 'Where to write it signed.' },
    },
    required: ['certificate', 'password'],
  },
  {
    name: 'compare_pdfs',
    title: 'Compare two versions',
    annotations: { readOnlyHint: true },
    description:
      'Compares a PDF open with another version of it, from a file: the words taken out, put in and changed, word by word across the whole of each (text moved to another page is no change), with their pages, and what the fields of their forms hold that changed.',
    properties: { document: DOCUMENT, file: { type: 'string', description: 'The path of the other version, as it was before.' } },
    required: ['file'],
  },
  {
    name: 'check_signatures',
    title: 'Check signatures',
    annotations: { readOnlyHint: true },
    description:
      'Checks the digital signatures of a PDF: whether what each signed is as it was signed, who signed and when, who gave the certificate, and whether the file was added to after. Not whether to trust who gave the certificate: a reader that knows the authorities says that.',
    properties: { file: { type: 'string', description: 'The path of a PDF; left out, the one open as it was opened.' } },
  },
  {
    name: 'undo',
    title: 'Undo',
    annotations: { readOnlyHint: true },
    description: 'Takes back the last change of the tools to a PDF.',
    properties: { document: DOCUMENT },
  },
  {
    name: 'list_pdfs',
    title: 'List the PDFs open',
    annotations: { readOnlyHint: true },
    description: 'Gives the PDFs open, and whether each has changes not saved.',
    properties: {},
  },
  {
    name: 'close_pdf',
    title: 'Close a PDF',
    annotations: { readOnlyHint: true },
    description: 'Lets go of a PDF open. What was not saved is lost.',
    properties: { document: DOCUMENT },
  },
];

/** Refused for where it is: said to the assistant, which can ask the person. */
class Refused extends Error {}

/** How big a PNG or JPEG is, read from its first bytes. */
export function imageSize(bytes: Uint8Array): { width: number; height: number; type: 'png' | 'jpeg' } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { width: view.getUint32(16), height: view.getUint32(20), type: 'png' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 9 < bytes.length; ) {
      if (bytes[at] !== 0xff) break;
      const marker = bytes[at + 1];
      const length = view.getUint16(at + 2);
      // The frames that say how big it is: SOF0 to SOF15, but for those that are not.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: view.getUint16(at + 5), width: view.getUint16(at + 7), type: 'jpeg' };
      at += 2 + length;
    }
  }
  throw new ToolError('The picture is not a PNG or a JPEG.');
}

export function createPdfServer(options: ServerOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const roots = (options.roots ?? []).map((root) => resolve(cwd, root));
  const open = new Map<string, Open>();
  let last = '';

  const allowed = (path: string) => {
    const full = resolve(cwd, path);
    if (roots.length && !roots.some((root) => !relative(root, full).startsWith('..') && !isAbsolute(relative(root, full)))) {
      throw new Refused(`${full} is outside the folders this server may use: ${roots.join(', ')}.`);
    }
    return full;
  };
  const document = (key: unknown): Open => {
    const file = key ? resolve(cwd, String(key)) : last;
    const found = open.get(file);
    if (!found) throw new ToolError(open.size ? `${key ?? 'That'} is not open. Open: ${[...open.keys()].join(', ')}.` : 'No PDF is open: open one with open_pdf.');
    return found;
  };
  const files: Files = {
    ocrCache: join(tmpdir(), 'rebopdf-tessdata'),
    async image(path) {
      const bytes = new Uint8Array(await readFile(allowed(path)));
      const { width, height, type } = imageSize(bytes);
      return { width, height, dataUrl: `data:image/${type};base64,${Buffer.from(bytes).toString('base64')}` };
    },
  };
  const read = async (path: string, password?: string) => {
    const full = allowed(path);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(full));
    } catch {
      throw new ToolError(`There is no file ${full}.`);
    }
    try {
      return { full, pdf: await openPdf(bytes, { name: basename(full), password }) };
    } catch (error) {
      throw new ToolError(error instanceof PdfError ? `${basename(full)}: ${error.message}` : String(error));
    }
  };
  let font: Promise<Uint8Array> | undefined;
  const fontBytes = () => (options.font ? (font ??= readFile(resolve(cwd, options.font)).then((bytes) => new Uint8Array(bytes))) : undefined);
  const change = (doc: Open, pdf: Pdf) => {
    doc.history.push(doc.pdf);
    if (doc.history.length > HISTORY) doc.history.shift();
    doc.pdf = pdf;
    doc.unsaved = true;
  };

  async function call(name: string, args: Record<string, unknown>): Promise<string> {
    switch (name) {
      case 'open_pdf': {
        const { full, pdf } = await read(String(args.file ?? ''), args.password === undefined ? undefined : String(args.password));
        open.set(full, { file: full, pdf, unsaved: false, history: [] });
        last = full;
        const info = [pdf.info.title && `title "${pdf.info.title}"`, pdf.info.author && `by ${pdf.info.author}`].filter(Boolean).join(', ');
        const marks = pdf.marks.length ? ` It comes with ${pdf.marks.length} highlights, notes or drawings (list_marks).` : '';
        const signed = pdf.signatures?.length
          ? ` It is digitally signed${pdf.signatures.map((s) => (s.name ? ` by ${s.name}` : '')).join(',')}: what is changed is added after the signature, which still holds, unless pages of another PDF are put in or something is blacked out.`
          : '';
        return `Opened ${full}: ${pdf.pages.length} pages, ${pdf.fields.length} form fields${info ? `, ${info}` : ''}.${marks}${signed} Read it with read_pdf.`;
      }
      case 'save_pdf': {
        const doc = document(args.document);
        const target = args.file ? allowed(String(args.file)) : doc.file.replace(/(\.pdf)?$/i, (ext) => ` (edited)${ext || '.pdf'}`);
        const incremental = savesIncrementally(doc.pdf);
        const bytes = await savePdf(doc.pdf, { flatten: !!args.flatten, font: await fontBytes() });
        await writeFile(target, bytes);
        if (target === doc.file) doc.unsaved = false;
        const blacked = doc.pdf.marks.filter((m) => m.kind === 'redaction').length;
        const notes = [
          blacked && `${blacked} ${blacked === 1 ? 'part' : 'parts'} blacked out for good: what was under them is not in the file`,
          doc.pdf.signatures?.length && (incremental ? 'added after its digital signature, which still holds' : `its digital signature no longer holds: ${whyNotIncremental(doc.pdf)}`),
        ].filter(Boolean);
        // The PDF open is the one saved: what is blacked out is gone from it too.
        if (blacked && target === doc.file) doc.pdf = await openPdf(bytes, { name: basename(target) });
        return `Wrote ${target} (${Math.round(bytes.length / 1024)} KB, ${doc.pdf.pages.length} pages${args.flatten ? ', flattened' : ''}).${notes.length ? ` ${notes.join('; ')}.` : ''}`;
      }
      case 'merge_pdfs': {
        const doc = document(args.document);
        const { full, pdf } = await read(String(args.file ?? ''));
        const before = args.before === undefined ? doc.pdf.pages.length : Number(args.before) - 1;
        if (before < 0 || before > doc.pdf.pages.length) throw new ToolError(`There are pages 1 to ${doc.pdf.pages.length}.`);
        change(doc, insertPdf(doc.pdf, pdf, before));
        return `Put in the ${pdf.pages.length} pages of ${basename(full)}: ${doc.pdf.pages.length} pages now.`;
      }
      case 'extract_pages': {
        const doc = document(args.document);
        const ids = pagesOf(doc.pdf, args.pages);
        const target = allowed(String(args.file ?? ''));
        if (extname(target).toLowerCase() !== '.pdf') throw new ToolError('Write it to a file that ends in .pdf.');
        await writeFile(target, await savePdf(extractPages(doc.pdf, ids, basename(target)), { font: await fontBytes() }));
        return `Wrote ${ids.length} ${ids.length === 1 ? 'page' : 'pages'} to ${target}.`;
      }
      case 'sign_digitally': {
        const doc = document(args.document);
        const read = async (key: string) => (args[key] ? new Uint8Array(await readFile(allowed(String(args[key])))) : undefined);
        const certificate = await read('certificate');
        const p12 = /\.(p12|pfx)$/i.test(String(args.certificate));
        let bytes: Uint8Array;
        try {
          bytes = await signPdf(doc.pdf, {
            ...(p12 ? { p12: certificate } : { certificate, key: await read('key') }),
            password: String(args.password ?? ''),
            ...(args.field ? { field: String(args.field) } : {}),
            ...(args.reason ? { reason: String(args.reason) } : {}),
            ...(args.location ? { location: String(args.location) } : {}),
            font: await fontBytes(),
          });
        } catch (error) {
          throw new ToolError(error instanceof Error ? error.message : String(error));
        }
        const target = args.file ? allowed(String(args.file)) : doc.file.replace(/(\.pdf)?$/i, (ext) => ` (signed)${ext || '.pdf'}`);
        await writeFile(target, bytes);
        // What is open is the PDF signed, to be signed again or added to.
        doc.history.push(doc.pdf);
        doc.pdf = await openPdf(bytes, { name: basename(target) });
        doc.unsaved = target !== doc.file;
        const [check] = (await checkSignatures(bytes)).slice(-1);
        return `Signed by ${check?.signer ?? 'the certificate'} and wrote ${target}.${check?.intact ? ' The signature checks: what was signed is as it was signed.' : ''}`;
      }
      case 'compare_pdfs': {
        const doc = document(args.document);
        const { full, pdf: before } = await read(String(args.file ?? ''));
        const { text, fields, pages } = await comparePdfs(before, doc.pdf);
        if (!text.length && !fields.length) return `${basename(full)} and ${basename(doc.file)} say the same.`;
        const at = (pdf: Pdf, places?: { page: string }[]) => (places?.length ? ` (page ${pdf.pages.findIndex((p) => p.id === places[0].page) + 1})` : '');
        const lines = text.map((c) =>
          c.kind === 'changed'
            ? `- changed${at(doc.pdf, c.out)}: "${c.before}" → "${c.after}"`
            : c.kind === 'removed'
              ? `- taken out${at(before, c.in)}: "${c.before}"`
              : `- put in${at(doc.pdf, c.out)}: "${c.after}"`,
        );
        const filled = fields.map((f) => `- field ${f.name}: ${JSON.stringify(f.before ?? null)} → ${JSON.stringify(f.after ?? null)}`);
        return `From ${basename(full)} (${pages[0]} pages) to ${basename(doc.file)} (${pages[1]} pages), ${text.length + fields.length} changes:\n${[...lines, ...filled].join('\n')}`;
      }
      case 'check_signatures': {
        const bytes = args.file
          ? new Uint8Array(await readFile(allowed(String(args.file))))
          : (() => {
              const doc = document(undefined);
              return doc.pdf.sources[doc.pdf.pages[0].source];
            })();
        const checks = await checkSignatures(bytes);
        if (!checks.length) return 'It has no digital signatures.';
        return checks
          .map((c) => {
            const state = !c.intact ? `does NOT hold: ${c.problem}` : c.whole ? 'holds: the file is as it was signed' : 'holds for what it signed: the file was added to after';
            return `- ${c.field}: ${c.signer ?? c.name ?? 'someone'}${c.date ? `, ${c.date.slice(0, 10)}` : ''}${c.reason ? ` ("${c.reason}")` : ''}, certificate by ${c.issuer ?? 'unknown'} — ${state}.`;
          })
          .join('\n');
      }
      case 'undo': {
        const doc = document(args.document);
        const before = doc.history.pop();
        if (!before) return 'There is nothing to undo.';
        doc.pdf = before;
        doc.unsaved = true;
        return 'Undone.';
      }
      case 'list_pdfs':
        return open.size ? [...open.values()].map((doc) => `- ${doc.file}: ${doc.pdf.pages.length} pages${doc.unsaved ? ', changes not saved' : ''}`).join('\n') : 'No PDF is open.';
      case 'close_pdf': {
        const doc = document(args.document);
        open.delete(doc.file);
        if (last === doc.file) last = [...open.keys()].at(-1) ?? '';
        return `Closed ${doc.file}${doc.unsaved ? ', without saving its changes' : ''}.`;
      }
      default: {
        const tool = findTool(name);
        if (!tool) throw new ToolError(`There is no tool ${name}.`);
        const doc = document(args.document);
        const result = await tool.run(doc.pdf, args, files);
        if (tool.writes && result.pdf && result.pdf !== doc.pdf) change(doc, result.pdf);
        return result.text;
      }
    }
  }

  const listed = [
    ...OWN.map(({ name, title, description, properties, required, annotations }) => ({
      name,
      title,
      description,
      inputSchema: { type: 'object', properties, ...(required ? { required } : {}) },
      annotations,
    })),
    ...TOOLS.map(({ name, title, description, properties, required, writes }) => ({
      name,
      title,
      description,
      inputSchema: { type: 'object', properties: { document: DOCUMENT, ...properties }, ...(required ? { required } : {}) },
      // What they change stays in memory until save_pdf: nothing of it is lost that undo cannot bring back.
      annotations: { readOnlyHint: !writes, destructiveHint: false },
    })),
  ];

  return {
    tools: listed,
    async handle(message: Message): Promise<object | undefined> {
      const { id, method, params = {} } = message;
      const answer = (result: object) => (id === undefined || id === null ? undefined : { jsonrpc: '2.0', id, result });
      switch (method) {
        case 'initialize': {
          const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
          return answer({
            protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
            capabilities: { tools: {} },
            serverInfo: { name: 'rebopdf', title: 'ReboPDF', version },
            instructions: INSTRUCTIONS,
          });
        }
        case 'ping':
          return answer({});
        case 'tools/list':
          return answer({ tools: listed });
        case 'tools/call': {
          const name = String(params.name ?? '');
          const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {};
          try {
            return answer({ content: [{ type: 'text', text: await call(name, args) }] });
          } catch (error) {
            // What the assistant can put right is said to it as the result of the tool; anything else is a fault of the server.
            const known = error instanceof Refused || error instanceof ToolError;
            const text = error instanceof Error ? error.message : String(error);
            return answer({ content: [{ type: 'text', text: known ? text : `The tool failed: ${text}` }], isError: true });
          }
        }
        default:
          if (id === undefined || id === null) return undefined;
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
      }
    },
  };
}
