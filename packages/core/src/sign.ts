// Digital signatures: a PDF signed with a certificate, as Acrobat and every
// reader of signatures checks them (a PKCS #7 signature, detached, of the
// bytes of the file but the signature itself), and the signatures of a file
// checked. The signature is added after the file as it is saved, so those
// it had still hold, and it is put in a signature field: one of the PDF, or
// one made for it (seen, in a box of a page, or not).
//
// A certificate is a .p12 (or .pfx) file and its password, or a certificate
// (.cer, .crt or PEM) and its key (.key, PKCS #8, encrypted or not, or PEM)
// with the password of the key, as Mexico's e.firma comes. RSA keys only.
// The certificate is not checked against authorities a reader trusts: a
// reader does that, and says so.

import { PDFArray, PDFDict, type PDFDocument, PDFHexString, PDFInvalidObject, PDFName, PDFNumber, PDFSignature, PDFString, StandardFonts } from '@cantoo/pdf-lib';
import type forgeType from 'node-forge';
import { annotate } from './objects';
import { formOf, loadDocument } from './open';
import { type SaveOptions, savePdf } from './save';
import { type Pdf, PdfError, type Rect, type Signature } from './types';

type Forge = typeof forgeType;

/** Room for the signature in the file, in bytes: a signature of RSA 4096 with a chain of three certificates takes about half. */
const ROOM = 16384;

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
}

const forge = async (): Promise<Forge> => ((await import('node-forge')) as unknown as { default: Forge }).default;

const binary = (bytes: Uint8Array) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
};
const bytesOf = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
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

/** Signs a PDF: saved as it is (after the signatures it has), and the signature added after it. */
export async function signPdf(pdf: Pdf, options: SignOptions): Promise<Uint8Array> {
  const f = await forge();
  const { key, certificates } = credentials(f, options);
  const [mine] = certificates;
  const now = new Date();
  if (mine.validity.notAfter < now) throw new PdfError('certificate', `The certificate expired on ${mine.validity.notAfter.toISOString().slice(0, 10)}.`);
  const date = options.date ?? now;
  const name = options.name ?? nameOf(mine) ?? 'Signed';

  const saved = await savePdf(pdf, { ...options, incremental: options.incremental ?? 'auto' });
  const doc = await loadDocument(saved, undefined, true);
  const { context } = doc;

  // The signature, with room for what it will hold: written as it is, out of any stream, to be filled after.
  const range = PDFArray.withContext(context);
  range.push(PDFNumber.of(0));
  for (let i = 0; i < 3; i++) range.push(PDFName.of('**********'));
  const text = (value?: string) => (value ? PDFHexString.fromText(value) : undefined);
  const dict = context.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'adbe.pkcs7.detached',
    ByteRange: range,
    Contents: PDFHexString.of('0'.repeat(ROOM * 2)),
    M: PDFString.fromDate(date),
    Name: text(name),
    ...(options.reason ? { Reason: text(options.reason) } : {}),
    ...(options.location ? { Location: text(options.location) } : {}),
    ...(options.contact ? { ContactInfo: text(options.contact) } : {}),
    Prop_Build: { App: { Name: 'ReboPDF' } },
  } as never) as unknown as PDFDict;
  const raw = new Uint8Array(dict.sizeInBytes());
  dict.copyBytesInto(raw, 0);
  const signature = context.register(PDFInvalidObject.of(raw));

  const form = formOf(doc) ?? doc.getForm();
  const pages = doc.getPages();
  /** What the box of a signature seen shows: who signed, and when. */
  const appearance = async (rect: Rect) => {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = [`Digitally signed by ${name}`, date.toISOString().replace('T', ' ').slice(0, 19), ...(options.reason ? [options.reason] : [])].map((l) => l.replace(/[^\x20-\x7e -ÿ]/g, ''));
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

  const bytes = new Uint8Array(await doc.save({ useObjectStreams: false }));

  // The bytes signed: all but the room for the signature.
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
  const signed = new Uint8Array(start + bytes.length - end);
  signed.set(bytes.subarray(0, start), 0);
  signed.set(bytes.subarray(end), start);

  // The signature: of a digest of the bytes, with when and what it was, by the key, with the certificates.
  const p7 = f.pkcs7.createSignedData();
  p7.content = f.util.createBuffer(binary(signed));
  for (const certificate of certificates) p7.addCertificate(certificate);
  p7.addSigner({
    key,
    certificate: mine,
    digestAlgorithm: f.pki.oids.sha256,
    authenticatedAttributes: [{ type: f.pki.oids.contentType, value: f.pki.oids.data }, { type: f.pki.oids.messageDigest }, { type: f.pki.oids.signingTime, value: date as never }],
  });
  p7.sign({ detached: true });
  const hex = f.util.bytesToHex(f.asn1.toDer(p7.toAsn1()).getBytes());
  if (hex.length > ROOM * 2) throw new PdfError('certificate', 'The signature does not fit its room: its chain of certificates is too long.');
  bytes.set(bytesOf(hex.padEnd(ROOM * 2, '0')), start + 1);
  return bytes;
}

/** What a signature of a file is found to be. */
export interface SignatureCheck extends Omit<Signature, 'source'> {
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
  /** Why it is not intact, when it is not. */
  problem?: string;
}

const DIGESTS: Record<string, 'sha1' | 'sha256' | 'sha384' | 'sha512'> = {
  '1.3.14.3.2.26': 'sha1',
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
};

/** Checks the signatures of a file: that what each signed is as it was, and who signed. Not who to trust: that is a reader's. */
export async function checkSignatures(bytes: Uint8Array): Promise<SignatureCheck[]> {
  const f = await forge();
  const doc: PDFDocument = await loadDocument(bytes);
  const out: SignatureCheck[] = [];
  for (const field of formOf(doc)?.getFields() ?? []) {
    if (!(field instanceof PDFSignature)) continue;
    const value = field.acroField.dict.lookup(PDFName.of('V'));
    if (!(value instanceof PDFDict)) continue;
    const read = (key: string) => {
      const v = value.lookup(PDFName.of(key));
      return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText().trim() : '';
    };
    const check: SignatureCheck = { field: field.getName(), intact: false, whole: false, ...(read('Name') ? { name: read('Name') } : {}), ...(read('Reason') ? { reason: read('Reason') } : {}) };
    out.push(check);
    try {
      const range = value.lookup(PDFName.of('ByteRange'));
      const contents = value.lookup(PDFName.of('Contents'));
      if (!(range instanceof PDFArray) || !(contents instanceof PDFHexString || contents instanceof PDFString)) throw new Error('It has no bytes signed, or no signature.');
      const [a, b, c, d] = range.asArray().map((n) => (n instanceof PDFNumber ? n.asNumber() : Number.NaN));
      if ([a, b, c, d].some((n) => !Number.isFinite(n)) || a !== 0 || c + d > bytes.length) throw new Error('The bytes it says it signed are not those of the file.');
      check.whole = c + d === bytes.length;
      const data = binary(bytes.subarray(a, b)) + binary(bytes.subarray(c, c + d));

      const der = contents instanceof PDFHexString ? contents.asBytes() : bytesOf(contents.asString());
      const asn1 = f.asn1.fromDer(binary(der), { parseAllBytes: false } as never);
      const message = f.pkcs7.messageFromAsn1(asn1) as unknown as { certificates: forgeType.pki.Certificate[] };
      // ContentInfo → [0] SignedData → its last part, the signers.
      const signedData = (asn1.value as forgeType.asn1.Asn1[])[1].value[0] as forgeType.asn1.Asn1;
      const parts = signedData.value as forgeType.asn1.Asn1[];
      const signer = (parts.at(-1)!.value as forgeType.asn1.Asn1[])[0].value as forgeType.asn1.Asn1[];
      const digestOid = f.asn1.derToOid((signer[2].value as forgeType.asn1.Asn1[])[0].value as string);
      const md = f.md[DIGESTS[digestOid] ?? 'sha256'].create();
      const attrs = signer.find((p) => p.tagClass === f.asn1.Class.CONTEXT_SPECIFIC && p.type === 0);
      const signatureValue = signer.find((p) => p.tagClass === f.asn1.Class.UNIVERSAL && p.type === f.asn1.Type.OCTETSTRING)!.value as string;
      // Its certificate: the one of the serial number it names, or the first.
      const serial = f.util.bytesToHex(((signer[1].value as forgeType.asn1.Asn1[])[1]?.value as string) ?? '');
      const certificate = message.certificates.find((cert) => cert.serialNumber.replace(/^0+/, '') === serial.replace(/^0+/, '')) ?? message.certificates[0];
      Object.assign(check, {
        signer: nameOf(certificate),
        issuer: nameOf(certificate, 'issuer'),
        validFrom: certificate?.validity.notBefore.toISOString(),
        validTo: certificate?.validity.notAfter.toISOString(),
      });
      md.update(data);
      const digest = md.digest().bytes();
      let signedBytes = digest;
      if (attrs) {
        const list = attrs.value as forgeType.asn1.Asn1[];
        for (const attr of list) {
          const [oid, set] = attr.value as forgeType.asn1.Asn1[];
          const type = f.asn1.derToOid(oid.value as string);
          const first = (set.value as forgeType.asn1.Asn1[])[0];
          if (type === f.pki.oids.messageDigest && first.value !== digest) throw new Error('The bytes signed are not as they were signed: the file was changed.');
          if (type === f.pki.oids.signingTime)
            check.date ??= (first.type === f.asn1.Type.UTCTIME ? f.asn1.utcTimeToDate(first.value as string) : f.asn1.generalizedTimeToDate(first.value as string)).toISOString();
        }
        // What was signed is its attributes, as a set.
        const set = f.asn1.create(f.asn1.Class.UNIVERSAL, f.asn1.Type.SET, true, list);
        const attrsDigest = f.md[DIGESTS[digestOid] ?? 'sha256'].create();
        attrsDigest.update(f.asn1.toDer(set).getBytes());
        signedBytes = attrsDigest.digest().bytes();
      }
      if (!certificate) throw new Error('It carries no certificate.');
      const verified = (certificate.publicKey as forgeType.pki.rsa.PublicKey).verify(signedBytes, signatureValue);
      if (!verified) throw new Error('It was not made by the key of its certificate.');
      check.intact = true;
    } catch (error) {
      check.problem = error instanceof Error ? error.message : String(error);
    }
    if (!check.date) {
      const m = read('M');
      const d = m && /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(m);
      if (d) check.date = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +(d[4] ?? 0), +(d[5] ?? 0), +(d[6] ?? 0))).toISOString();
    }
  }
  return out;
}
