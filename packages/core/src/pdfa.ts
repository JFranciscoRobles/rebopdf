// A PDF made PDF/A (ISO 19005), as archives keep documents for good: every
// font it draws with carried in it (those it names without carrying taken
// from the ones PDF.js carries, made to measure as the standard ones:
// Liberation Sans for Helvetica and Arial, Foxit's for Times, Courier,
// Symbol and ZapfDingbats), the widths it says of each as its font has them;
// nothing that runs (JavaScript, actions that launch or hide), no
// appearances left to the reader to make, its annotations printed; and its
// identity, its colours (an sRGB profile) and its metadata (XMP) as PDF/A
// says, by pdf-lib. PDF/A-2B, or 3B when it carries files.

import { decodePDFRawStream, PDFArray, PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, PDFRawStream, type PDFRef, PDFStream } from '@cantoo/pdf-lib';
import { Encodings } from '@cantoo/pdf-lib/standard-fonts';
import { standardFont } from './pdfjs';
import { PdfError } from './types';

export type PdfALevel = '2B' | '3B';

/** The glyphs of WinAnsiEncoding, from code 32. */
export const WIN_ANSI = (
  'space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash ' +
  'zero one two three four five six seven eight nine colon semicolon less equal greater question at ' +
  'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave ' +
  'a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde bullet ' +
  'Euro bullet quotesinglbase florin quotedblbase ellipsis dagger daggerdbl circumflex perthousand Scaron guilsinglleft OE bullet Zcaron bullet ' +
  'bullet quoteleft quoteright quotedblleft quotedblright bullet endash emdash tilde trademark scaron guilsinglright oe bullet zcaron Ydieresis ' +
  'space exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot hyphen registered macron ' +
  'degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown ' +
  'Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis ' +
  'Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls ' +
  'agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis ' +
  'eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis'
).split(' ');

const nameOf = (o: PDFObject | undefined) => (o instanceof PDFName ? o.decodeText() : undefined);

/** A font PDF.js carries to put in for one named without being carried: by its name, and what its descriptor says. */
function substitute(base: string, flags: number): { file: string; type1: boolean } {
  const bold = /bold|black|heavy|semibold/i.test(base);
  const italic = /italic|oblique/i.test(base) || (flags & 64) !== 0;
  const style = (styles: [string, string, string, string]) => styles[(bold ? 1 : 0) + (italic ? 2 : 0)];
  if (/symbol/i.test(base)) return { file: 'FoxitSymbol.pfb', type1: true };
  if (/dingbat/i.test(base)) return { file: 'FoxitDingbats.pfb', type1: true };
  if (/courier|mono|fixed|consol/i.test(base) || (flags & 1) !== 0) return { file: style(['FoxitFixed.pfb', 'FoxitFixedBold.pfb', 'FoxitFixedItalic.pfb', 'FoxitFixedBoldItalic.pfb']), type1: true };
  if (/times|serif|roman|georgia|garamond|cambria|book/i.test(base) || (flags & 2) !== 0)
    return { file: style(['FoxitSerif.pfb', 'FoxitSerifBold.pfb', 'FoxitSerifItalic.pfb', 'FoxitSerifBoldItalic.pfb']), type1: true };
  return { file: style(['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'LiberationSans-Italic.ttf', 'LiberationSans-BoldItalic.ttf']), type1: false };
}

/** A program of a font put in a file, read: its name, its box, and the width of each of its glyphs, by name and by code point. */
interface Program {
  name: string;
  bbox: [number, number, number, number];
  italic: number;
  ascent: number;
  descent: number;
  byName(glyph: string): number | undefined;
  byCode?(code: number): string | undefined;
  stream(doc: PDFDocument): PDFRef;
  key: 'FontFile2' | 'FontFile3';
  symbolic: boolean;
}

/** The names CFF fonts share, by their number (SID), up to the Latin ones. */
const CFF_STRINGS = (
  '.notdef ' +
  WIN_ANSI.slice(0, 95).join(' ').replace('quotesingle', 'quoteright').replace(' grave ', ' quoteleft ') +
  ' exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl ' +
  'endash dagger daggerdbl periodcentered paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand questiondown ' +
  'grave acute circumflex tilde macron breve dotaccent dieresis ring cedilla hungarumlaut ogonek caron emdash ' +
  'AE ordfeminine Lslash Oslash OE ordmasculine ae dotlessi lslash oslash oe germandbls onesuperior logicalnot mu trademark Eth onehalf plusminus ' +
  'Thorn onequarter divide brokenbar degree thorn threequarters twosuperior registered minus eth multiply threesuperior copyright ' +
  'Aacute Acircumflex Adieresis Agrave Aring Atilde Ccedilla Eacute Ecircumflex Edieresis Egrave Iacute Icircumflex Idieresis Igrave Ntilde ' +
  'Oacute Ocircumflex Odieresis Ograve Otilde Scaron Uacute Ucircumflex Udieresis Ugrave Yacute Ydieresis Zcaron ' +
  'aacute acircumflex adieresis agrave aring atilde ccedilla eacute ecircumflex edieresis egrave iacute icircumflex idieresis igrave ntilde ' +
  'oacute ocircumflex odieresis ograve otilde scaron uacute ucircumflex udieresis ugrave yacute ydieresis zcaron'
).split(' ');

/** A bare CFF font (as PDF.js carries Foxit's), read: its name, box, and the width and name of each glyph, and its own codes. */
export function readCff(bytes: Uint8Array): Program {
  const card16 = (at: number) => (bytes[at] << 8) | bytes[at + 1];
  const offset = (at: number, size: number) => {
    let v = 0;
    for (let i = 0; i < size; i++) v = v * 256 + bytes[at + i];
    return v;
  };
  /** An INDEX: its items, and where it ends. */
  const index = (at: number) => {
    const count = card16(at);
    if (!count) return { items: [] as Uint8Array[], end: at + 2 };
    const size = bytes[at + 2];
    const base = at + 3 + (count + 1) * size - 1;
    const items: Uint8Array[] = [];
    for (let i = 0; i < count; i++) items.push(bytes.subarray(base + offset(at + 3 + i * size, size), base + offset(at + 3 + (i + 1) * size, size)));
    return { items, end: base + offset(at + 3 + count * size, size) };
  };
  /** A DICT: its operands, by operator (12 x as 1200 + x). */
  const dict = (data: Uint8Array) => {
    const out = new Map<number, number[]>();
    let operands: number[] = [];
    for (let i = 0; i < data.length; ) {
      const b = data[i];
      if (b <= 21) {
        const op = b === 12 ? 1200 + data[i + 1] : b;
        i += b === 12 ? 2 : 1;
        out.set(op, operands);
        operands = [];
      } else if (b === 28) {
        operands.push(((data[i + 1] << 24) | (data[i + 2] << 16)) >> 16);
        i += 3;
      } else if (b === 29) {
        operands.push((data[i + 1] << 24) | (data[i + 2] << 16) | (data[i + 3] << 8) | data[i + 4]);
        i += 5;
      } else if (b === 30) {
        let text = '';
        for (i++; i < data.length; i++) {
          const nibbles = [data[i] >> 4, data[i] & 15];
          let done = false;
          for (const n of nibbles) {
            if (n === 15) done = true;
            else text += n <= 9 ? String(n) : ['.', 'E', 'E-', '', '-'][n - 10];
          }
          if (done) {
            i++;
            break;
          }
        }
        operands.push(Number(text));
      } else if (b <= 246) {
        operands.push(b - 139);
        i++;
      } else if (b <= 250) {
        operands.push((b - 247) * 256 + data[i + 1] + 108);
        i += 2;
      } else {
        operands.push(-(b - 251) * 256 - data[i + 1] - 108);
        i += 2;
      }
    }
    return out;
  };
  const names = index(bytes[2]);
  const tops = index(names.end);
  const strings = index(tops.end);
  const top = dict(tops.items[0]);
  const stringOf = (sid: number) => (sid < CFF_STRINGS.length ? CFF_STRINGS[sid] : sid >= 391 ? new TextDecoder('latin1').decode(strings.items[sid - 391]) : undefined);
  const charstrings = index(top.get(17)![0]).items;
  const [privateSize, privateAt] = top.get(18) ?? [0, 0];
  const priv = dict(bytes.subarray(privateAt, privateAt + privateSize));
  const defaultWidth = priv.get(20)?.[0] ?? 0;
  const nominalWidth = priv.get(21)?.[0] ?? 0;

  // The name of each glyph, by its charset.
  const glyphNames: (string | undefined)[] = ['.notdef'];
  const charsetAt = top.get(15)?.[0] ?? 0;
  if (charsetAt > 2) {
    const format = bytes[charsetAt];
    let at = charsetAt + 1;
    while (glyphNames.length < charstrings.length) {
      if (format === 0) {
        glyphNames.push(stringOf(card16(at)));
        at += 2;
      } else {
        const first = card16(at);
        const left = format === 1 ? bytes[at + 2] : card16(at + 2);
        for (let i = 0; i <= left && glyphNames.length < charstrings.length; i++) glyphNames.push(stringOf(first + i));
        at += format === 1 ? 3 : 4;
      }
    }
  } else for (let gid = 1; gid < charstrings.length; gid++) glyphNames.push(stringOf(gid));

  // The width of each glyph: the first number of its program, when it has one more than its first command takes; run through its subroutines.
  const globals = index(strings.end).items;
  const locals = priv.get(19) ? index(privateAt + priv.get(19)![0]).items : [];
  const bias = (n: number) => (n < 1240 ? 107 : n < 33900 ? 1131 : 32768);
  const widthOf = (program: Uint8Array) => {
    const stack: number[] = [];
    let width: number | undefined;
    // Whether the width was found (or cannot be): what follows a return goes on in the caller.
    const run = (code: Uint8Array, depth: number): boolean => {
      for (let i = 0; i < code.length; ) {
        const v = code[i];
        if (v === 28) {
          stack.push(((code[i + 1] << 24) | (code[i + 2] << 16)) >> 16);
          i += 3;
        } else if (v === 255) {
          stack.push(((code[i + 1] << 24) | (code[i + 2] << 16) | (code[i + 3] << 8) | code[i + 4]) / 65536);
          i += 5;
        } else if (v >= 32) {
          stack.push(v <= 246 ? v - 139 : v <= 250 ? (v - 247) * 256 + code[i + 1] + 108 : -(v - 251) * 256 - code[i + 1] - 108);
          i += v <= 246 ? 1 : 2;
        } else if (v === 10 || v === 29) {
          const subrs = v === 10 ? locals : globals;
          const sub = subrs[(stack.pop() ?? 0) + bias(subrs.length)];
          if (!sub || depth > 10) return true;
          if (run(sub, depth + 1)) return true;
          i++;
        } else if (v === 11) return false;
        else {
          const takes = v === 21 ? 2 : v === 4 || v === 22 ? 1 : v === 14 ? (stack.length >= 4 ? 4 : 0) : [1, 3, 18, 23, 19, 20].includes(v) ? stack.length - (stack.length % 2) : -1;
          if (takes >= 0 && stack.length > takes) width = nominalWidth + stack[0];
          return true;
        }
      }
      return false;
    };
    run(program, 0);
    return width ?? defaultWidth;
  };
  const widths = charstrings.map(widthOf);
  const byName = new Map<string, number>();
  glyphNames.forEach((glyph, gid) => {
    if (glyph && !byName.has(glyph)) byName.set(glyph, Math.round(widths[gid]));
  });

  // Its own codes, when it has them (as Symbol and Dingbats do).
  const codes = new Map<number, string>();
  const encodingAt = top.get(16)?.[0] ?? 0;
  if (encodingAt > 1) {
    const format = bytes[encodingAt] & 0x7f;
    if (format === 0) {
      const n = bytes[encodingAt + 1];
      for (let i = 0; i < n; i++) codes.set(bytes[encodingAt + 2 + i], glyphNames[i + 1] ?? '');
    } else {
      const ranges = bytes[encodingAt + 1];
      let gid = 1;
      for (let r = 0; r < ranges; r++) {
        const first = bytes[encodingAt + 2 + r * 2];
        const left = bytes[encodingAt + 3 + r * 2];
        for (let i = 0; i <= left; i++) codes.set(first + i, glyphNames[gid++] ?? '');
      }
    }
  }
  const bbox = (top.get(5) ?? [0, -200, 1000, 900]).map(Math.round) as Program['bbox'];
  return {
    name: new TextDecoder('latin1').decode(names.items[0]).replace(/[^\x21-\x7e]/g, ''),
    bbox,
    italic: top.get(1202)?.[0] ?? 0,
    ascent: bbox[3],
    descent: bbox[1],
    byName: (glyph) => byName.get(glyph),
    byCode: codes.size ? (code) => codes.get(code) : undefined,
    key: 'FontFile3',
    symbolic: codes.size > 0,
    stream: (doc) => doc.context.register(doc.context.flateStream(bytes, { Subtype: 'Type1C' } as never)),
  };
}

/** A TrueType font, read with fontkit: its widths, by the names of its glyphs. */
async function readTrueType(bytes: Uint8Array): Promise<Program> {
  const fontkit = ((await import('@cantoo/fontkit')) as unknown as { default: { create(b: Uint8Array): FontkitFont } }).default;
  const font = fontkit.create(bytes);
  const scale = 1000 / font.unitsPerEm;
  const byName = new Map<string, number>();
  for (let id = 0; id < font.numGlyphs; id++) {
    const glyph = font.getGlyph(id);
    if (glyph.name && !byName.has(glyph.name)) byName.set(glyph.name, Math.round(glyph.advanceWidth * scale));
  }
  const b = font.bbox;
  return {
    name: font.postscriptName.replace(/[^\x21-\x7e]/g, ''),
    bbox: [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * scale)) as Program['bbox'],
    italic: font.italicAngle,
    ascent: Math.round(font.ascent * scale),
    descent: Math.round(font.descent * scale),
    byName: (glyph) => byName.get(glyph),
    key: 'FontFile2',
    symbolic: false,
    stream: (doc) => doc.context.register(doc.context.flateStream(bytes, { Length1: bytes.length } as never)),
  };
}

interface FontkitFont {
  unitsPerEm: number;
  numGlyphs: number;
  postscriptName: string;
  italicAngle: number;
  ascent: number;
  descent: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  getGlyph(id: number): { name?: string; advanceWidth: number };
}

/** The name of the glyph of each code of a simple font: by its encoding and its differences, or as its program has them. */
function glyphsOf(dict: PDFDict, program: Program): (code: number) => string | undefined {
  const encoding = dict.lookup(PDFName.of('Encoding'));
  const differences = new Map<number, string>();
  let base = nameOf(encoding);
  if (encoding instanceof PDFDict) {
    base = nameOf(encoding.lookup(PDFName.of('BaseEncoding')));
    const list = encoding.lookup(PDFName.of('Differences'));
    let code = 0;
    if (list instanceof PDFArray)
      for (const item of list.asArray()) {
        if (item instanceof PDFNumber) code = item.asNumber();
        else if (item instanceof PDFName) differences.set(code++, item.decodeText());
      }
  }
  return (code) => differences.get(code) ?? (program.symbolic && !base ? program.byCode?.(code) : code >= 32 ? WIN_ANSI[code - 32] : undefined);
}

/** Whether a font is drawn with without being carried. */
function unembedded(dict: PDFDict): boolean {
  const subtype = nameOf(dict.lookup(PDFName.of('Subtype')));
  if (subtype !== 'Type1' && subtype !== 'TrueType' && subtype !== 'MMType1') return false;
  const descriptor = dict.lookup(PDFName.of('FontDescriptor'));
  return !(descriptor instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some((key) => descriptor.has(PDFName.of(key))));
}

/** Every dictionary of the document, direct or not, once. */
function* dictionaries(doc: PDFDocument): Generator<PDFDict> {
  const seen = new Set<PDFObject>();
  const stack: PDFObject[] = doc.context.enumerateIndirectObjects().map(([, o]) => o);
  while (stack.length) {
    const o = stack.pop()!;
    if (seen.has(o)) continue;
    seen.add(o);
    if (o instanceof PDFStream) stack.push(o.dict);
    else if (o instanceof PDFDict) {
      yield o;
      for (const [, value] of o.entries()) if (!(value instanceof PDFName)) stack.push(value);
    } else if (o instanceof PDFArray) for (let i = 0; i < o.size(); i++) stack.push(o.get(i));
  }
}

const ACTIONS_NOT_ALLOWED = new Set(['Launch', 'Sound', 'Movie', 'ResetForm', 'ImportData', 'Hide', 'SetOCGState', 'Rendition', 'Trans', 'GoTo3DView', 'JavaScript']);

/** Makes a document PDF/A, of the level asked, or 3B when it carries files and 2B is not asked for. */
export async function makePdfA(doc: PDFDocument, level?: PdfALevel): Promise<PdfALevel> {
  const names = doc.catalog.lookup(PDFName.of('Names'));
  const carries = names instanceof PDFDict && names.has(PDFName.of('EmbeddedFiles'));
  const conformance = level ?? (carries ? '3B' : '2B');
  if (conformance === '2B' && carries) throw new PdfError('invalid', 'A PDF/A-2B carries no files: make it PDF/A-3B, or take its files out.');

  // Every font drawn with, carried.
  const programs = new Map<string, Promise<{ program: Program; file: PDFRef; descriptor?: PDFRef }>>();
  const load = (file: string, type1: boolean) => {
    let loading = programs.get(file);
    if (!loading) {
      loading = (async () => {
        const bytes = await standardFont(file);
        if (!bytes) throw new PdfError('invalid', `The font ${file} of PDF.js was not found to put in the PDF: give usePdfAssets the address of the pdfjs-dist folder.`);
        const program = type1 ? readCff(bytes) : await readTrueType(bytes);
        // Symbol and Dingbats read their codes as they always have, by names of their own.
        const own = /Symbol/.test(file) ? Encodings.Symbol : /Dingbats/.test(file) ? Encodings.ZapfDingbats : undefined;
        if (own && !program.byCode) {
          const codes = new Map<number, string>();
          for (const [code, glyph] of Object.values((own as unknown as { unicodeMappings: Record<number, [number, string]> }).unicodeMappings)) codes.set(code, glyph);
          program.byCode = (code) => codes.get(code);
          program.symbolic = true;
        }
        return { program, file: program.stream(doc) };
      })();
      programs.set(file, loading);
    }
    return loading;
  };
  for (const dict of [...dictionaries(doc)]) {
    const type = nameOf(dict.lookup(PDFName.of('Type')));
    if ((type === 'Font' || dict.has(PDFName.of('BaseFont'))) && unembedded(dict)) {
      const base = nameOf(dict.lookup(PDFName.of('BaseFont'))) ?? 'Helvetica';
      const old = dict.lookup(PDFName.of('FontDescriptor'));
      const flags = old instanceof PDFDict ? ((old.lookup(PDFName.of('Flags')) as PDFNumber | undefined)?.asNumber() ?? 0) : 0;
      const { file, type1 } = substitute(base, flags);
      const loaded = await load(file, type1);
      const { program } = loaded;
      const glyph = glyphsOf(dict, program);
      const widths: number[] = [];
      for (let code = 0; code < 256; code++) widths.push(program.byName(glyph(code) ?? '.notdef') ?? program.byName('space') ?? 0);
      loaded.descriptor ??= doc.context.register(
        doc.context.obj({
          Type: 'FontDescriptor',
          FontName: program.name,
          Flags: (program.symbolic ? 4 : 32) | (program.italic ? 64 : 0) | (type1 && /Serif/.test(file) ? 2 : 0) | (/Fixed/.test(file) ? 1 : 0),
          FontBBox: program.bbox,
          ItalicAngle: program.italic,
          Ascent: program.ascent,
          Descent: program.descent,
          CapHeight: Math.round(program.ascent * 0.72),
          StemV: 80,
          [program.key]: loaded.file,
        } as never),
      );
      dict.set(PDFName.of('Subtype'), PDFName.of(type1 ? 'Type1' : 'TrueType'));
      dict.set(PDFName.of('BaseFont'), PDFName.of(program.name));
      dict.set(PDFName.of('FontDescriptor'), loaded.descriptor);
      dict.set(PDFName.of('FirstChar'), PDFNumber.of(0));
      dict.set(PDFName.of('LastChar'), PDFNumber.of(255));
      dict.set(PDFName.of('Widths'), doc.context.obj(widths));
      // A TrueType of Latin text says how its codes are read: as WinAnsi, when it said nothing.
      if (!type1 && !dict.has(PDFName.of('Encoding'))) dict.set(PDFName.of('Encoding'), PDFName.of('WinAnsiEncoding'));
      continue;
    }

    // Nothing that runs, nor actions PDF/A does not allow.
    dict.delete(PDFName.of('AA'));
    dict.delete(PDFName.of('JS'));
    const action = dict.lookup(PDFName.of('A'));
    if (action instanceof PDFDict && ACTIONS_NOT_ALLOWED.has(nameOf(action.lookup(PDFName.of('S'))) ?? '')) dict.delete(PDFName.of('A'));
    if (type === 'Annot') {
      // Printed, and not hidden.
      const flags = (dict.lookup(PDFName.of('F')) as PDFNumber | undefined)?.asNumber() ?? 0;
      if (nameOf(dict.lookup(PDFName.of('Subtype'))) !== 'Popup') dict.set(PDFName.of('F'), PDFNumber.of((flags | 4) & ~(1 | 2 | 32)));
    }
    if (nameOf(dict.lookup(PDFName.of('Subtype'))) === 'Image') {
      dict.delete(PDFName.of('Interpolate'));
      dict.delete(PDFName.of('Alternates'));
      dict.delete(PDFName.of('OPI'));
    }
  }
  if (names instanceof PDFDict) names.delete(PDFName.of('JavaScript'));
  const open = doc.catalog.lookup(PDFName.of('OpenAction'));
  if (open instanceof PDFDict && ACTIONS_NOT_ALLOWED.has(nameOf(open.lookup(PDFName.of('S'))) ?? '')) doc.catalog.delete(PDFName.of('OpenAction'));
  const form = doc.catalog.lookup(PDFName.of('AcroForm'));
  if (form instanceof PDFDict) {
    form.delete(PDFName.of('NeedAppearances'));
    form.delete(PDFName.of('XFA'));
  }
  doc.catalog.delete(PDFName.of('AA'));

  doc.convertToPDFA({ conformance } as never);
  return conformance;
}

/** Takes out of a document's metadata that it is a PDF/A: once protected by a password, it is not one. */
export function unclaimPdfA(doc: PDFDocument): void {
  const metadata = doc.catalog.lookup(PDFName.of('Metadata'));
  if (!(metadata instanceof PDFStream)) return;
  const raw = metadata instanceof PDFRawStream ? decodePDFRawStream(metadata).decode() : metadata.getContents();
  const xmp = new TextDecoder().decode(raw);
  if (!xmp.includes('pdfaid')) return;
  const without = xmp.replace(/\s*pdfaid:\w+\s*=\s*("[^"]*"|'[^']*')/g, '').replace(/<pdfaid:(\w+)>[^<]*<\/pdfaid:\1>/g, '');
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(doc.context.stream(new TextEncoder().encode(without), { Type: 'Metadata', Subtype: 'XML' } as never)));
  // pdf-lib keeps it in step no longer.
  (doc as unknown as { managePDFAMetadata?: boolean }).managePDFAMetadata = false;
}
