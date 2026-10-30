// Digital signatures: a PDF signed with a certificate, as Acrobat and every
// reader of signatures checks them (CMS signed data, detached, of the bytes
// of the file but the signature itself: PAdES, or PKCS #7 as before it), and
// the signatures of a file checked. The signature is added after the file as
// it is saved, so those it had still hold, and it is put in a signature
// field: one of the PDF, or one made for it (seen, in a box of a page, or
// not).
//
// When it was signed can be vouched for by a time-stamping authority (RFC
// 3161), in the signature or for the whole file; and what proves, years
// after, that its certificates were not revoked when it was signed (their
// chain, and the OCSP answers and CRLs of each) can be put in the file, as
// PAdES asks for signatures to be checked in the long term.
//
// A certificate is a .p12 (or .pfx) file and its password, or a certificate
// (.cer, .crt or PEM) and its key (.key, PKCS #8, encrypted or not, or PEM)
// with the password of the key, as Mexico's e.firma comes. RSA keys only.
// Who to trust is given to `checkSignatures`: the certificates of the
// authorities (as the SAT's, for e.firma) a chain is to end in.

import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFHexString,
  PDFInvalidObject,
  PDFName,
  PDFNumber,
  PDFRawStream,
  type PDFRef,
  PDFSignature,
  PDFString,
  StandardFonts,
} from '@cantoo/pdf-lib';
import type forgeType from 'node-forge';
import {
  type Asn1,
  addTimestamp,
  addressesOf,
  authorityAt,
  binary,
  bytesOf,
  type Cert,
  checkSigner,
  checkTimestamp,
  type Forge,
  forge,
  issuerAmong,
  OIDS,
  ocspRequest,
  type Revocation,
  readCerts,
  readContentInfo,
  readCrl,
  readOcsp,
  selfSigned,
  signatureValueOf,
  signedData,
  type TimestampAuthority,
  timestamp,
} from './cms';
import { annotate } from './objects';
import { formOf, loadDocument } from './open';
import { type SaveOptions, savePdf } from './save';
import { type Pdf, PdfError, type Rect, type Signature } from './types';
import { writeIncrement } from './writer';

export type { TimestampAuthority } from './cms';

/** Room for the signature in the file, in bytes: a signature of RSA 4096 with a chain of three certificates and a time-stamp takes about half. */
const ROOM = 24576;

export interface SignOptions extends SaveOptions {
  /** A .p12 or .pfx file. */
  p12?: Uint8Array;
  /** Or a certificate (DER or PEM) and its key (PKCS #8 DER, encrypted or not, or PEM). */
  certificate?: Uint8Array;
  key?: Uint8Array;
  /** The password of the .p12, or of the key. */
  password?: string;
  /** A signature field of the PDF to sign in, by its name. */
  field?: string;
  /** Or a box of a page for the signature to be seen in; with neither, it is not seen. */
  place?: { page: string; rect: Rect };
  /** Who signs, as the signature says it: the name of the certificate when left out. */
  name?: string;
  reason?: string;
  location?: string;
  contact?: string;
  date?: Date;
  /** PAdES (ETSI.CAdES.detached), as signatures are made now; or PKCS #7 (adbe.pkcs7.detached), as readers before 2009 read them. */
  format?: 'pades' | 'pkcs7';
  /** A time-stamping authority to vouch for when it was signed: its address (asked by HTTP; most do not answer pages of other sites), or what asks it. */
  timestamp?: string | TimestampAuthority;
}

/** An authority as given: by its address, or what asks it. */
const authorityOf = (given: string | TimestampAuthority, fetcher?: typeof fetch) => (typeof given === 'string' ? authorityAt(given, fetcher) : given);

const isPem = (bytes: Uint8Array) => binary(bytes.subarray(0, 64)).includes('-----BEGIN');

/** The key and the certificates (the signer's first) a signer gives. */
function credentials(f: Forge, options: SignOptions): { key: forgeType.pki.rsa.PrivateKey; certificates: forgeType.pki.Certificate[] } {
  const password = options.password ?? '';
  try {
    let key: forgeType.pki.rsa.PrivateKey | undefined;
    let certificates: forgeType.pki.Certificate[] = [];
    if (options.p12) {
      const p12 = f.pkcs12.pkcs12FromAsn1(f.asn1.fromDer(binary(options.p12)), password);
      const keys = [...(p12.getBags({ bagType: f.pki.oids.pkcs8ShroudedKeyBag })[f.pki.oids.pkcs8ShroudedKeyBag] ?? []), ...(p12.getBags({ bagType: f.pki.oids.keyBag })[f.pki.oids.keyBag] ?? [])];
      key = keys.find((bag) => bag.key)?.key as forgeType.pki.rsa.PrivateKey | undefined;
      certificates = (p12.getBags({ bagType: f.pki.oids.certBag })[f.pki.oids.certBag] ?? []).flatMap((bag) => (bag.cert ? [bag.cert] : []));
    } else if (options.certificate && options.key) {
      const pem = binary(options.certificate);
      certificates = isPem(options.certificate)
        ? pem
            .split(/(?=-----BEGIN CERTIFICATE-----)/)
            .filter((p) => p.includes('BEGIN CERTIFICATE'))
            .map((p) => f.pki.certificateFromPem(p))
        : [f.pki.certificateFromAsn1(f.asn1.fromDer(pem))];
      if (isPem(options.key)) {
        const text = binary(options.key);
        key = /ENCRYPTED/.test(text) ? f.pki.decryptRsaPrivateKey(text, password) : f.pki.privateKeyFromPem(text);
      } else {
        const asn1 = f.asn1.fromDer(binary(options.key));
        // Encrypted (as e.firma's .key is) or not.
        let info: forgeType.asn1.Asn1 | null = asn1;
        try {
          info = f.pki.decryptPrivateKeyInfo(asn1, password);
        } catch {
          info = asn1;
        }
        if (!info) throw new Error('password');
        key = f.pki.privateKeyFromAsn1(info) as forgeType.pki.rsa.PrivateKey;
      }
    } else throw new PdfError('certificate', 'Give a .p12 file, or a certificate and its key.');
    if (!key || !certificates.length) throw new PdfError('certificate', 'The certificate has no key, or the key no certificate.');
    // The signer's certificate is the one of the key.
    const own = certificates.findIndex((c) => (c.publicKey as forgeType.pki.rsa.PublicKey).n?.equals(key!.n));
    if (own < 0) throw new PdfError('certificate', 'The key is not the one of the certificate.');
    return { key, certificates: [certificates[own], ...certificates.filter((_, i) => i !== own)] };
  } catch (error) {
    if (error instanceof PdfError) throw error;
    const text = error instanceof Error ? error.message : String(error);
    if (/password|MAC|decrypt|Invalid/i.test(text)) throw new PdfError('certificate', 'The password is not the one of the certificate.');
    throw new PdfError('certificate', `The certificate or its key could not be read (RSA keys only): ${text}`);
  }
}

/** The common name a certificate says of its subject, or what it says. */
const nameOf = (c: forgeType.pki.Certificate | undefined, of: 'subject' | 'issuer' = 'subject') =>
  (c?.[of].getField('CN')?.value as string | undefined) ?? (c?.[of].attributes.map((a) => a.value).join(', ') || undefined);

/** A signature's dictionary, written as it is, out of any stream, with room for what it will hold, to be filled after the file is written. */
function withRoom(doc: PDFDocument, entries: Record<string, unknown>): PDFRef {
  const { context } = doc;
  const range = PDFArray.withContext(context);
  range.push(PDFNumber.of(0));
  for (let i = 0; i < 3; i++) range.push(PDFName.of('**********'));
  const dict = context.obj({ ...entries, ByteRange: range, Contents: PDFHexString.of('0'.repeat(ROOM * 2)) } as never) as unknown as PDFDict;
  const raw = new Uint8Array(dict.sizeInBytes());
  dict.copyBytesInto(raw, 0);
  return context.register(PDFInvalidObject.of(raw));
}

/** The room for the signature of a file written, filled: the bytes it signs said, and what signs them put in. */
async function fillRoom(bytes: Uint8Array, sign: (signed: string) => Promise<string>): Promise<Uint8Array> {
  const file = binary(bytes);
  const room = `<${'0'.repeat(ROOM * 2)}>`;
  const start = file.lastIndexOf(room);
  const placeholder = /\/ByteRange\s*\[\s*0\s+\/\*{10}\s+\/\*{10}\s+\/\*{10}\s*\]/g;
  let match: RegExpExecArray | null = null;
  for (let m = placeholder.exec(file); m; m = placeholder.exec(file)) match = m;
  if (start < 0 || !match) throw new PdfError('certificate', 'The room for the signature was not found in the file.');
  const end = start + room.length;
  const ranges = `/ByteRange [0 ${start} ${end} ${bytes.length - end}]`;
  if (ranges.length > match[0].length) throw new PdfError('certificate', 'The file is too big for the room of its signature.');
  bytes.set(bytesOf(ranges.padEnd(match[0].length, ' ')), match.index);
  // The bytes signed: all but the room for the signature.
  const signed = binary(bytes.subarray(0, start)) + binary(bytes.subarray(end));
  const der = await sign(signed);
  const hex = Array.from(der, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  if (hex.length > ROOM * 2) throw new PdfError('certificate', 'The signature does not fit its room: its chain of certificates is too long.');
  bytes.set(bytesOf(hex.padEnd(ROOM * 2, '0')), start + 1);
  return bytes;
}

/** A name for a new signature field, not taken. */
function freeName(doc: PDFDocument): string {
  const taken = new Set((formOf(doc)?.getFields() ?? []).map((x) => x.getName()));
  let n = 1;
  while (taken.has(`Signature${n}`)) n++;
  return `Signature${n}`;
}

/** Signs a PDF: saved as it is (after the signatures it has), and the signature added after it. */
export async function signPdf(pdf: Pdf, options: SignOptions): Promise<Uint8Array> {
  const f = await forge();
  const { key, certificates } = credentials(f, options);
  const [mine] = certificates;
  const now = new Date();
  if (mine.validity.notAfter < now) throw new PdfError('certificate', `The certificate expired on ${mine.validity.notAfter.toISOString().slice(0, 10)}.`);
  const date = options.date ?? now;
  const name = options.name ?? nameOf(mine) ?? 'Signed';
  const pades = (options.format ?? 'pades') === 'pades';

  const saved = await savePdf(pdf, { ...options, incremental: options.incremental ?? 'auto' });
  const doc = await loadDocument(saved, undefined, true);
  const { context } = doc;

  const text = (value?: string) => (value ? PDFHexString.fromText(value) : undefined);
  const signature = withRoom(doc, {
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: pades ? 'ETSI.CAdES.detached' : 'adbe.pkcs7.detached',
    M: PDFString.fromDate(date),
    Name: text(name),
    ...(options.reason ? { Reason: text(options.reason) } : {}),
    ...(options.location ? { Location: text(options.location) } : {}),
    ...(options.contact ? { ContactInfo: text(options.contact) } : {}),
    Prop_Build: { App: { Name: 'ReboPDF' } },
  });

  const form = formOf(doc) ?? doc.getForm();
  const pages = doc.getPages();
  /** What the box of a signature seen shows: who signed, and when. */
  const appearance = async (rect: Rect) => {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = [`Digitally signed by ${name}`, date.toISOString().replace('T', ' ').slice(0, 19), ...(options.reason ? [options.reason] : [])].map((l) => l.replace(/[^\x20-\x7e -ÿ]/g, ''));
    const size = Math.max(5, Math.min(10, rect.height / (lines.length * 1.35), (rect.width - 6) / (Math.max(...lines.map((l) => font.widthOfTextAtSize(l, 1))) || 1)));
    const ops = lines.map((line, i) => `BT /F1 ${size.toFixed(2)} Tf 3 ${(rect.height - size * (1.15 + i * 1.3)).toFixed(2)} Td ${font.encodeText(line).toString()} Tj ET`).join('\n');
    const stream = context.stream(`0.1 0.15 0.35 rg\n${ops}`, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, rect.width, rect.height], Resources: { Font: { F1: font.ref } } } as never);
    return context.register(stream);
  };

  let field: PDFDict;
  if (options.field) {
    const found = form.getFields().find((x) => x.getName() === options.field);
    if (!(found instanceof PDFSignature)) throw new PdfError('not-found', `There is no signature field ${options.field}.`);
    if (found.acroField.dict.get(PDFName.of('V'))) throw new PdfError('not-found', `${options.field} is signed already.`);
    field = found.acroField.dict;
    const [widget] = found.acroField.getWidgets();
    const r = widget?.getRectangle();
    if (widget && r && r.width > 0 && r.height > 0) widget.dict.set(PDFName.of('AP'), context.obj({ N: await appearance({ x: r.x, y: r.y, width: r.width, height: r.height }) }));
  } else {
    const index = options.place ? pdf.pages.findIndex((p) => p.id === options.place!.page) : 0;
    const page = pages[Math.max(0, index)];
    const r = options.place?.rect ?? { x: 0, y: 0, width: 0, height: 0 };
    const taken = new Set(form.getFields().map((x) => x.getName()));
    let n = 1;
    while (taken.has(`Signature${n}`)) n++;
    field = context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      T: PDFString.of(`Signature${n}`),
      Rect: [r.x, r.y, r.x + r.width, r.y + r.height],
      F: 132,
      P: page.ref,
      ...(r.width > 0 ? { AP: { N: await appearance(r) } } : {}),
    } as never) as unknown as PDFDict;
    const ref = context.register(field);
    annotate(page, ref);
    form.acroForm.addField(ref);
  }
  field.set(PDFName.of('V'), signature);
  // The PDF has signatures, and is to be changed only by adding to it.
  form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3));

  const authority = options.timestamp ? authorityOf(options.timestamp) : undefined;
  return fillRoom(await writeIncrement(doc), async (signed) => {
    // A digest of the bytes signed, with what it is, signed by the key, with the certificates.
    const cms = signedData(f, { key, certificates, digest: f.md.sha256.create().update(signed).digest().bytes(), pades, date });
    if (authority) addTimestamp(f, cms, await stamped(f, authority, signatureValueOf(f, cms)));
    return f.asn1.toDer(cms).getBytes();
  });
}

/** A time-stamp of the authority, or an error said so a person understands it. */
async function stamped(f: Forge, authority: TimestampAuthority, data: string): Promise<Asn1> {
  try {
    return await timestamp(f, authority, data);
  } catch (error) {
    throw new PdfError('certificate', `No time-stamp could be had: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * A time-stamp of the whole file, added after it (a document time-stamp, as
 * PAdES calls it): an authority vouches that the file was as it is then. Put
 * after what checks its signatures in the long term (`addValidationData`),
 * it keeps them checkable after their certificates expire.
 */
export async function timestampPdf(bytes: Uint8Array, options: { timestamp: string | TimestampAuthority; fetch?: typeof fetch }): Promise<Uint8Array> {
  const f = await forge();
  const doc = await loadDocument(bytes, undefined, true);
  const { context } = doc;
  const stamp = withRoom(doc, { Type: 'DocTimeStamp', Filter: 'Adobe.PPKLite', SubFilter: 'ETSI.RFC3161' });
  const form = formOf(doc) ?? doc.getForm();
  const page = doc.getPage(0);
  const field = context.register(context.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFString.of(freeName(doc)), Rect: [0, 0, 0, 0], F: 132, P: page.ref, V: stamp } as never));
  annotate(page, field);
  form.acroForm.addField(field);
  form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3));
  const authority = authorityOf(options.timestamp, options.fetch);
  return fillRoom(await writeIncrement(doc), async (signed) => f.asn1.toDer(await stamped(f, authority, signed)).getBytes());
}

// --- What a file's signatures are -------------------------------------------------------

interface Found {
  field: string;
  value: PDFDict;
  kind: 'signature' | 'timestamp';
  format: 'pades' | 'pkcs7' | 'rfc3161';
  /** The bytes it signed, as forge holds them; the signature; whether they are the whole file. */
  data?: string;
  der?: Uint8Array;
  whole: boolean;
  problem?: string;
}

/** The signatures of a document, each with the bytes it signed. */
function signaturesIn(doc: PDFDocument, bytes: Uint8Array): Found[] {
  const out: Found[] = [];
  for (const field of formOf(doc)?.getFields() ?? []) {
    if (!(field instanceof PDFSignature)) continue;
    const value = field.acroField.dict.lookup(PDFName.of('V'));
    if (!(value instanceof PDFDict)) continue;
    const sub = value.lookup(PDFName.of('SubFilter'));
    const subFilter = sub instanceof PDFName ? sub.decodeText() : '';
    const format = subFilter === 'ETSI.RFC3161' ? 'rfc3161' : subFilter === 'ETSI.CAdES.detached' ? 'pades' : 'pkcs7';
    const found: Found = { field: field.getName(), value, kind: format === 'rfc3161' ? 'timestamp' : 'signature', format, whole: false };
    out.push(found);
    const range = value.lookup(PDFName.of('ByteRange'));
    const contents = value.lookup(PDFName.of('Contents'));
    if (!(range instanceof PDFArray) || !(contents instanceof PDFHexString || contents instanceof PDFString)) {
      found.problem = 'It has no bytes signed, or no signature.';
      continue;
    }
    const [a, b, c, d] = range.asArray().map((n) => (n instanceof PDFNumber ? n.asNumber() : Number.NaN));
    if ([a, b, c, d].some((n) => !Number.isFinite(n)) || a !== 0 || c + d > bytes.length) {
      found.problem = 'The bytes it says it signed are not those of the file.';
      continue;
    }
    found.whole = c + d === bytes.length;
    found.data = binary(bytes.subarray(a, b)) + binary(bytes.subarray(c, c + d));
    found.der = contents instanceof PDFHexString ? contents.asBytes() : bytesOf(contents.asString());
  }
  return out;
}

/** What the file carries to check its certificates with, in its DSS: certificates, OCSP answers and CRLs. */
function validationDataOf(doc: PDFDocument): { certs: Uint8Array[]; ocsps: Uint8Array[]; crls: Uint8Array[] } {
  const dss = doc.catalog.lookup(PDFName.of('DSS'));
  const list = (key: string) => {
    if (!(dss instanceof PDFDict)) return [];
    const array = dss.lookup(PDFName.of(key));
    if (!(array instanceof PDFArray)) return [];
    return array.asArray().flatMap((ref) => {
      const stream = doc.context.lookup(ref);
      return stream instanceof PDFRawStream ? [decodePDFRawStream(stream).decode()] : [];
    });
  };
  return { certs: list('Certs'), ocsps: list('OCSPs'), crls: list('CRLs') };
}

/** The chain of a certificate, up to one issued by itself, among some. */
async function chainOf(f: Forge, certificate: Cert, pool: Cert[]): Promise<Cert[]> {
  const chain = [certificate];
  for (let current = certificate; chain.length < 10 && !(await selfSigned(f, current)); ) {
    const next = await issuerAmong(f, current, pool);
    if (!next || chain.some((c) => c.der === next.der)) break;
    chain.push(next);
    current = next;
  }
  return chain;
}

/**
 * Puts in the file what checks its signatures in the long term: the chain of
 * the certificate of each signature (and of the authorities of their
 * time-stamps), and for each certificate whether it was revoked, as its
 * issuer answers (OCSP) or lists (CRL), asked at the addresses the
 * certificate gives. Added after the file, as its Document Security Store;
 * given, the answers and lists are put in without asking.
 */
export async function addValidationData(bytes: Uint8Array, options: { certificates?: Uint8Array[]; ocsps?: Uint8Array[]; crls?: Uint8Array[]; fetch?: typeof fetch } = {}): Promise<Uint8Array> {
  const f = await forge();
  const fetcher = options.fetch ?? fetch;
  const doc = await loadDocument(bytes, undefined, true);
  const had = validationDataOf(doc);
  const pool = [...readCerts(f, options.certificates), ...readCerts(f, had.certs)];
  const tops: Cert[] = [];
  for (const found of signaturesIn(doc, bytes)) {
    if (!found.der) continue;
    const cms = readContentInfo(f, binary(found.der));
    const tokens = found.kind === 'timestamp' ? [cms] : [cms, ...(await checkSigner(f, cms, found.data ?? '')).timestamps];
    for (const token of tokens) {
      const check = await checkSigner(f, token, '');
      pool.push(...check.certificates);
      if (check.certificate) tops.push(check.certificate);
    }
  }
  const certs = new Map<string, Cert>();
  const ocsps = [...(options.ocsps ?? [])];
  const crls = [...(options.crls ?? [])];
  const known = async (c: Cert, issuer: Cert) => {
    for (const o of [...had.ocsps, ...ocsps]) if (await readOcsp(f, o, c, issuer)) return true;
    for (const l of [...had.crls, ...crls]) if (await readCrl(f, l, c, issuer)) return true;
    return false;
  };
  for (const top of tops) {
    const chain = await chainOf(f, top, pool);
    for (const [i, c] of chain.entries()) {
      certs.set(c.der, c);
      const issuer = chain[i + 1];
      if (!issuer || (await known(c, issuer))) continue;
      let got = false;
      for (const url of addressesOf(f, c, OIDS.authorityInfoAccess, OIDS.ocsp)) {
        try {
          const response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/ocsp-request' }, body: ocspRequest(f, c, issuer) as BodyInit });
          const answer = new Uint8Array(await response.arrayBuffer());
          if (await readOcsp(f, answer, c, issuer)) {
            ocsps.push(answer);
            got = true;
            break;
          }
        } catch {
          // The next address, or a list.
        }
      }
      if (got) continue;
      for (const url of addressesOf(f, c, OIDS.crlDistributionPoints)) {
        try {
          const list = new Uint8Array(await (await fetcher(url)).arrayBuffer());
          if (await readCrl(f, list, c, issuer)) {
            crls.push(list);
            break;
          }
        } catch {
          // The next address.
        }
      }
    }
  }

  const { context } = doc;
  const dss = doc.catalog.lookup(PDFName.of('DSS'));
  const store = dss instanceof PDFDict ? dss : (context.obj({ Type: 'DSS' } as never) as unknown as PDFDict);
  const put = (key: string, items: Uint8Array[], have: Uint8Array[]) => {
    const fresh = items.filter((item) => !have.some((h) => binary(h) === binary(item)));
    if (!fresh.length) return;
    const existing = store.lookup(PDFName.of(key));
    const array = existing instanceof PDFArray ? existing : context.obj([]);
    for (const item of fresh) array.push(context.register(context.flateStream(item)));
    store.set(PDFName.of(key), array);
  };
  put('Certs', [...certs.keys()].map(bytesOf), had.certs);
  put('OCSPs', ocsps, had.ocsps);
  put('CRLs', crls, had.crls);
  if (!(dss instanceof PDFDict)) doc.catalog.set(PDFName.of('DSS'), context.register(store));
  return writeIncrement(doc);
}

/** What a signature of a file is found to be. */
export interface SignatureCheck extends Omit<Signature, 'source'> {
  /** A signature of someone, or a time-stamp of the whole file (made by an authority). */
  kind: 'signature' | 'timestamp';
  /** As it was made: PAdES, PKCS #7, or a time-stamp of RFC 3161. */
  format: 'pades' | 'pkcs7' | 'rfc3161';
  /** Whether the bytes it signed are as they were signed, and it was made by the key of its certificate. */
  intact: boolean;
  /** Whether it signed the whole file; if not, the file was added to after it was signed (as a later signature or change does). */
  whole: boolean;
  /** Who its certificate says signed, and who gave the certificate. */
  signer?: string;
  issuer?: string;
  /** When its certificate holds from and to. */
  validFrom?: string;
  validTo?: string;
  /** When an authority vouches it was signed, by a time-stamp in it. */
  timestamp?: { date: string; authority?: string; intact: boolean };
  /** The names of its chain of certificates, from the signer's up. */
  chain: string[];
  /** Given who to trust: whether its chain ends in one of them, each certificate issued by the next and holding when it was signed. */
  trusted?: boolean;
  /** Whether a certificate of its chain was revoked, as the file says (or 'unknown', when it does not say of each). */
  revocation: Revocation;
  /** Whether the file carries what checks it in the long term: whether each certificate of its chain was revoked. */
  longTerm: boolean;
  /** Why it is not intact, or not trusted, when it is not. */
  problem?: string;
}

export interface CheckOptions {
  /** The certificates of the authorities to trust (DER or PEM): the chain of a signature is to end in one. */
  trusted?: Uint8Array[];
}

/** Checks the signatures of a file: that what each signed is as it was, who signed, when, and, given who to trust, whether to. */
export async function checkSignatures(bytes: Uint8Array, options: CheckOptions = {}): Promise<SignatureCheck[]> {
  const f = await forge();
  const doc: PDFDocument = await loadDocument(bytes);
  const trusted = readCerts(f, options.trusted);
  const store = validationDataOf(doc);
  const stored = readCerts(f, store.certs);
  const out: SignatureCheck[] = [];
  for (const found of signaturesIn(doc, bytes)) {
    const read = (key: string) => {
      const v = found.value.lookup(PDFName.of(key));
      return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText().trim() : '';
    };
    const check: SignatureCheck = {
      field: found.field,
      kind: found.kind,
      format: found.format,
      intact: false,
      whole: found.whole,
      chain: [],
      revocation: 'unknown',
      longTerm: false,
      ...(read('Name') ? { name: read('Name') } : {}),
      ...(read('Reason') ? { reason: read('Reason') } : {}),
    };
    out.push(check);
    let certificate: Cert | undefined;
    let pool: Cert[] = [];
    let when: Date | undefined;
    try {
      if (!found.der || found.data === undefined) throw new Error(found.problem);
      const cms = readContentInfo(f, binary(found.der));
      if (found.kind === 'timestamp') {
        const stamp = await checkTimestamp(f, cms, found.data);
        certificate = stamp.authority;
        pool = stamp.certificates;
        when = stamp.date;
        check.date = stamp.date.toISOString();
        if (!stamp.intact) throw new Error(stamp.problem);
      } else {
        const signer = await checkSigner(f, cms, found.data);
        certificate = signer.certificate;
        pool = signer.certificates;
        if (signer.date) check.date = signer.date.toISOString();
        const [token] = signer.timestamps;
        if (token) {
          const stamp = await checkTimestamp(f, token, signer.signatureValue);
          check.timestamp = { date: stamp.date.toISOString(), authority: stamp.authority?.name, intact: stamp.intact };
          if (stamp.intact) when = stamp.date;
        }
        if (!signer.intact) throw new Error(signer.problem);
      }
      check.intact = true;
    } catch (error) {
      check.problem = error instanceof Error ? error.message : String(error);
    }
    if (!check.date) {
      const m = read('M');
      const d = m && /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(m);
      if (d) check.date = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +(d[4] ?? 0), +(d[5] ?? 0), +(d[6] ?? 0))).toISOString();
    }
    if (!certificate) continue;
    Object.assign(check, {
      signer: certificate.name,
      issuer: certificate.issuerName,
      validFrom: certificate.notBefore.toISOString(),
      validTo: certificate.notAfter.toISOString(),
    });

    // Its chain, and whether each of it was revoked, as the file says.
    const chain = await chainOf(f, certificate, [...pool, ...stored, ...trusted]);
    check.chain = chain.map((c) => c.name ?? '?');
    const statuses: Revocation[] = [];
    for (const [i, c] of chain.slice(0, -1).entries()) {
      const issuer = chain[i + 1];
      const said = [...(await Promise.all(store.ocsps.map((o) => readOcsp(f, o, c, issuer)))), ...(await Promise.all(store.crls.map((l) => readCrl(f, l, c, issuer))))].filter((x) => x !== undefined);
      statuses.push(said.some((x) => x.status === 'revoked') ? 'revoked' : said.some((x) => x.status === 'good') ? 'good' : 'unknown');
    }
    check.revocation = statuses.includes('revoked') ? 'revoked' : statuses.length && statuses.every((s) => s === 'good') ? 'good' : 'unknown';
    check.longTerm = check.revocation === 'good' && (await selfSigned(f, chain.at(-1)!));
    if (trusted.length) {
      const at = when ?? (check.date ? new Date(check.date) : new Date());
      const root = chain.at(-1)!;
      const anchored = chain.some((c) => trusted.some((t) => t.der === c.der));
      const holding = chain.every((c) => c.notBefore <= at && at <= c.notAfter);
      check.trusted = check.intact && anchored && holding && check.revocation !== 'revoked';
      if (!check.trusted && check.intact)
        check.problem = !anchored
          ? `Its chain ends in ${root.name}, which is not trusted.`
          : !holding
            ? 'A certificate of its chain did not hold when it was signed.'
            : 'A certificate of its chain was revoked.';
    }
  }
  return out;
}

export type { Revocation } from './cms';
