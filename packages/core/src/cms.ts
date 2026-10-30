// What digital signatures are made of, as PDF signatures carry them: CMS
// (PKCS #7) signed data, made here on node-forge's ASN.1, as forge itself
// makes it with only three attributes and PAdES asks for more; the
// time-stamps of an authority (RFC 3161) that say when something was signed;
// and what says whether a certificate was revoked (OCSP answers and CRLs),
// read, and asked for.
//
// What is checked is read here, certificates too, and checked with the Web
// Crypto of the browser or of Node: keys of RSA (PKCS #1 and PSS) and of
// elliptic curves, as authorities use, where forge reads RSA alone.

import type forgeType from 'node-forge';

export type Forge = typeof forgeType;
export type Asn1 = forgeType.asn1.Asn1;
/** A certificate as forge holds it: the signer's, to sign with. */
export type Certificate = forgeType.pki.Certificate;

export const OIDS = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  timeStampToken: '1.2.840.113549.1.9.16.2.14',
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  sha1: '1.3.14.3.2.26',
  sha256: '2.16.840.1.101.3.4.2.1',
  sha384: '2.16.840.1.101.3.4.2.2',
  sha512: '2.16.840.1.101.3.4.2.3',
  rsa: '1.2.840.113549.1.1.1',
  rsaPss: '1.2.840.113549.1.1.10',
  ec: '1.2.840.10045.2.1',
  ocsp: '1.3.6.1.5.5.7.48.1',
  ocspBasic: '1.3.6.1.5.5.7.48.1.1',
  authorityInfoAccess: '1.3.6.1.5.5.7.1.1',
  crlDistributionPoints: '2.5.29.31',
  subjectKeyIdentifier: '2.5.29.14',
  commonName: '2.5.4.3',
};

const HASHES: Record<string, 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'> = {
  [OIDS.sha1]: 'SHA-1',
  [OIDS.sha256]: 'SHA-256',
  [OIDS.sha384]: 'SHA-384',
  [OIDS.sha512]: 'SHA-512',
};
/** The algorithms of signatures: of RSA or of elliptic curves, and their digest. */
const SIGNATURES: Record<string, { kind: 'rsa' | 'ec'; hash: string }> = {
  '1.2.840.113549.1.1.5': { kind: 'rsa', hash: OIDS.sha1 },
  '1.2.840.113549.1.1.11': { kind: 'rsa', hash: OIDS.sha256 },
  '1.2.840.113549.1.1.12': { kind: 'rsa', hash: OIDS.sha384 },
  '1.2.840.113549.1.1.13': { kind: 'rsa', hash: OIDS.sha512 },
  '1.2.840.10045.4.1': { kind: 'ec', hash: OIDS.sha1 },
  '1.2.840.10045.4.3.2': { kind: 'ec', hash: OIDS.sha256 },
  '1.2.840.10045.4.3.3': { kind: 'ec', hash: OIDS.sha384 },
  '1.2.840.10045.4.3.4': { kind: 'ec', hash: OIDS.sha512 },
};
const CURVES: Record<string, { name: string; size: number }> = {
  '1.2.840.10045.3.1.7': { name: 'P-256', size: 32 },
  '1.3.132.0.34': { name: 'P-384', size: 48 },
  '1.3.132.0.35': { name: 'P-521', size: 66 },
};

export const forge = async (): Promise<Forge> => ((await import('node-forge')) as unknown as { default: Forge }).default;

/** Bytes as forge holds them: a string of one character a byte. */
export const binary = (bytes: Uint8Array) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
};
export const bytesOf = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

/** The digest of bytes (as forge holds them) by the algorithm of an OID; SHA-256 when it is not known. */
export function digest(f: Forge, oid: string, data: string): string {
  const name = ({ 'SHA-1': 'sha1', 'SHA-256': 'sha256', 'SHA-384': 'sha384', 'SHA-512': 'sha512' } as const)[HASHES[oid] ?? 'SHA-256'];
  const md = f.md[name].create();
  md.update(data);
  return md.digest().bytes();
}

/** What ASN.1 is built of, made shorter to write. */
export function asn1(f: Forge) {
  const { Class, Type, create } = f.asn1;
  const seq = (...value: Asn1[]) => create(Class.UNIVERSAL, Type.SEQUENCE, true, value);
  const set = (...value: Asn1[]) => create(Class.UNIVERSAL, Type.SET, true, value);
  const oid = (id: string) => create(Class.UNIVERSAL, Type.OID, false, f.asn1.oidToDer(id).getBytes());
  const nul = () => create(Class.UNIVERSAL, Type.NULL, false, '');
  return {
    seq,
    set,
    oid,
    nul,
    int: (n: number) => create(Class.UNIVERSAL, Type.INTEGER, false, f.asn1.integerToDer(n).getBytes()),
    /** An integer of these bytes, positive. */
    bigInt: (bytes: string) => create(Class.UNIVERSAL, Type.INTEGER, false, bytes.charCodeAt(0) & 0x80 ? `\0${bytes}` : bytes),
    octets: (bytes: string) => create(Class.UNIVERSAL, Type.OCTETSTRING, false, bytes),
    bool: (value: boolean) => create(Class.UNIVERSAL, Type.BOOLEAN, false, value ? '\xff' : '\0'),
    bits: (bytes: string) => create(Class.UNIVERSAL, Type.BITSTRING, false, `\0${bytes}`),
    enumerated: (n: number) => create(Class.UNIVERSAL, Type.ENUMERATED, false, String.fromCharCode(n)),
    time: (date: Date) => create(Class.UNIVERSAL, Type.GENERALIZEDTIME, false, f.asn1.dateToGeneralizedTime(date)),
    utc: (date: Date) => create(Class.UNIVERSAL, Type.UTCTIME, false, f.asn1.dateToUtcTime(date)),
    ctx: (n: number, value: Asn1[] | string, constructed = Array.isArray(value)) => create(Class.CONTEXT_SPECIFIC, n, constructed, value),
    alg: (id: string, parameters = true) => (parameters ? seq(oid(id), nul()) : seq(oid(id))),
    attribute: (id: string, ...value: Asn1[]) => seq(oid(id), set(...value)),
    der: (node: Asn1) => f.asn1.toDer(node).getBytes(),
  };
}

const kids = (node: Asn1 | undefined) => (Array.isArray(node?.value) ? (node.value as Asn1[]) : []);
const isCtx = (f: Forge, node: Asn1 | undefined, n: number) => node?.tagClass === f.asn1.Class.CONTEXT_SPECIFIC && node.type === n;
const oidOf = (f: Forge, node: Asn1 | undefined) => (node && node.type === f.asn1.Type.OID ? f.asn1.derToOid(node.value as string) : '');
const timeOf = (f: Forge, node: Asn1 | undefined) =>
  node ? (node.type === f.asn1.Type.UTCTIME ? f.asn1.utcTimeToDate(node.value as string) : f.asn1.generalizedTimeToDate(node.value as string)) : undefined;
/** An integer's bytes as hex, without the zeros it may start with: as serial numbers are compared. */
const hexOf = (f: Forge, node: Asn1 | undefined) => f.util.bytesToHex((node?.value as string) ?? '').replace(/^(00)+/, '');
/** The bytes of a bit string, as they were: forge reads what they hold as ASN.1 when it can, and keeps them apart. */
const bitsOf = (f: Forge, node: Asn1 | undefined) => {
  const kept = (node as (Asn1 & { bitStringContents?: string }) | undefined)?.bitStringContents;
  const value = kept ?? (Array.isArray(node?.value) ? `\0${(node.value as Asn1[]).map((k) => f.asn1.toDer(k).getBytes()).join('')}` : ((node?.value as string) ?? ''));
  return value.slice(1);
};
/** ASN.1 read, its bit strings kept as they are. */
const read = (f: Forge, der: string) => f.asn1.fromDer(der, { parseAllBytes: false, decodeBitStrings: false } as never);

// --- Certificates ---------------------------------------------------------------------

/** A certificate as it is read to be checked: of any key. */
export interface Cert {
  der: string;
  /** What its issuer signed of it, how, and the signature. */
  tbs: string;
  algorithm: Asn1;
  signature: string;
  serial: Asn1;
  serialHex: string;
  issuer: string;
  subject: string;
  /** Its key, as SubjectPublicKeyInfo, and the bits of the key alone. */
  spki: string;
  keyBits: string;
  notBefore: Date;
  notAfter: Date;
  name?: string;
  issuerName?: string;
  keyId?: string;
  extensions: { id: string; value: string }[];
}

/** The text of a string of ASN.1: UTF-8 (when it is), UCS-2, or a byte a letter. */
function stringOf(f: Forge, node: Asn1): string {
  const raw = node.value as string;
  if (node.type === f.asn1.Type.BMPSTRING) {
    let out = '';
    for (let i = 0; i + 1 < raw.length; i += 2) out += String.fromCharCode((raw.charCodeAt(i) << 8) | raw.charCodeAt(i + 1));
    return out;
  }
  try {
    return f.util.decodeUtf8(raw);
  } catch {
    return raw;
  }
}

/** The common name of a name, or all it says. */
function nameText(f: Forge, name: Asn1): string | undefined {
  const values: string[] = [];
  let common: string | undefined;
  for (const rdn of kids(name))
    for (const attribute of kids(rdn)) {
      const [id, value] = kids(attribute);
      const text = typeof value?.value === 'string' ? stringOf(f, value) : '';
      if (oidOf(f, id) === OIDS.commonName) common = text;
      values.push(text);
    }
  return common ?? (values.join(', ') || undefined);
}

export function readCert(f: Forge, node: Asn1): Cert {
  const [tbsNode, algorithm, signature] = kids(node);
  const tbs = kids(tbsNode);
  const at = isCtx(f, tbs[0], 0) ? 1 : 0;
  const validity = kids(tbs[at + 3]);
  const spki = tbs[at + 5];
  const extensions = kids(kids(tbs.find((p) => isCtx(f, p, 3)))[0]).map((e) => {
    const parts = kids(e);
    return { id: oidOf(f, parts[0]), value: parts.at(-1)?.value as string };
  });
  const ski = extensions.find((e) => e.id === OIDS.subjectKeyIdentifier);
  const der = (n: Asn1) => f.asn1.toDer(n).getBytes();
  return {
    der: der(node),
    tbs: der(tbsNode),
    algorithm,
    signature: bitsOf(f, signature),
    serial: tbs[at],
    serialHex: hexOf(f, tbs[at]),
    issuer: der(tbs[at + 2]),
    subject: der(tbs[at + 4]),
    spki: der(spki),
    keyBits: bitsOf(f, kids(spki)[1]),
    notBefore: timeOf(f, validity[0])!,
    notAfter: timeOf(f, validity[1])!,
    name: nameText(f, tbs[at + 4]),
    issuerName: nameText(f, tbs[at + 2]),
    keyId: ski ? f.util.bytesToHex(read(f, ski.value).value as string) : undefined,
    extensions,
  };
}

/** A certificate of forge's, read as one to be checked. */
export const certOf = (f: Forge, c: Certificate) => readCert(f, read(f, f.asn1.toDer(f.pki.certificateToAsn1(c)).getBytes()));

/** Certificates of DER bytes or PEM text, read; those that are not, left out. */
export function readCerts(f: Forge, given: Uint8Array[] = []): Cert[] {
  return given.flatMap((bytes) => {
    const text = binary(bytes);
    const ders = text.includes('-----BEGIN')
      ? text.split(/(?=-----BEGIN CERTIFICATE-----)/).flatMap((p) => (p.includes('BEGIN CERTIFICATE') ? [f.util.decode64(p.replace(/-----[^-]+-----|\s/g, ''))] : []))
      : [text];
    return ders.flatMap((der) => {
      try {
        return [readCert(f, read(f, der))];
      } catch {
        return [];
      }
    });
  });
}

const subtle = () => globalThis.crypto.subtle;
const buffer = (bytes: string) => bytesOf(bytes) as BufferSource;

/** An ECDSA signature as DER (r, s), as Web Crypto takes it: r and s, each of the curve's size. */
function rawEcSignature(f: Forge, der: string, size: number): Uint8Array {
  const [r, s] = kids(read(f, der)).map((n) => (n.value as string).replace(/^\0+/, '').padStart(size, '\0'));
  return bytesOf(r + s);
}

/**
 * Whether a signature of data was made by the key of a SubjectPublicKeyInfo,
 * by the algorithm named (of a signature, or a key's, with the digest apart).
 */
export async function verifySignature(f: Forge, spki: string, algorithm: Asn1, data: string, signature: string, digestOid = OIDS.sha256): Promise<boolean> {
  try {
    const id = oidOf(f, kids(algorithm)[0]);
    const [keyAlgorithm] = kids(read(f, spki));
    const keyId = oidOf(f, kids(keyAlgorithm)[0]);
    const known = SIGNATURES[id];
    if (id === OIDS.rsaPss) {
      // Its digest, and how long its salt: SHA-1 and 20 when it does not say.
      const params = kids(kids(algorithm)[1]);
      const hash = oidOf(f, kids(kids(params.find((p) => isCtx(f, p, 0)))[0])[0]) || OIDS.sha1;
      const salt = kids(params.find((p) => isCtx(f, p, 2)))[0];
      const saltLength = salt ? Number.parseInt(f.util.bytesToHex(salt.value as string), 16) : 20;
      const key = await subtle().importKey('spki', buffer(spki), { name: 'RSA-PSS', hash: HASHES[hash] }, false, ['verify']);
      return await subtle().verify({ name: 'RSA-PSS', saltLength }, key, buffer(signature), buffer(data));
    }
    if (known?.kind === 'rsa' || id === OIDS.rsa || (!known && keyId === OIDS.rsa)) {
      const hash = HASHES[known?.hash ?? digestOid] ?? 'SHA-256';
      const key = await subtle().importKey('spki', buffer(spki), { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']);
      return await subtle().verify('RSASSA-PKCS1-v1_5', key, buffer(signature), buffer(data));
    }
    if (known?.kind === 'ec' || id === OIDS.ec || keyId === OIDS.ec) {
      const curve = CURVES[oidOf(f, kids(keyAlgorithm)[1])];
      if (!curve) return false;
      const hash = HASHES[known?.hash ?? digestOid] ?? 'SHA-256';
      const key = await subtle().importKey('spki', buffer(spki), { name: 'ECDSA', namedCurve: curve.name }, false, ['verify']);
      return await subtle().verify({ name: 'ECDSA', hash }, key, rawEcSignature(f, signature, curve.size) as BufferSource, buffer(data));
    }
  } catch {
    // A key or a signature not read: not verified.
  }
  return false;
}

/** Whether a certificate was issued by another: named by it, and signed by its key. */
export async function issuedBy(f: Forge, child: Cert, issuer: Cert): Promise<boolean> {
  return child.issuer === issuer.subject && verifySignature(f, issuer.spki, child.algorithm, child.tbs, child.signature);
}
export const selfSigned = (f: Forge, c: Cert) => issuedBy(f, c, c);

/** The certificate a certificate was issued by, among some. */
export async function issuerAmong(f: Forge, c: Cert, among: Cert[]): Promise<Cert | undefined> {
  for (const other of among) if (other.der !== c.der && (await issuedBy(f, c, other))) return other;
  return undefined;
}

/** The addresses a certificate gives, under one of its extensions, as URIs. */
export function addressesOf(f: Forge, c: Cert, extension: string, method?: string): string[] {
  const found = c.extensions.find((e) => e.id === extension);
  if (!found) return [];
  const out: string[] = [];
  const walk = (node: Asn1, ok: boolean) => {
    if (isCtx(f, node, 6) && !node.constructed && ok) out.push(node.value as string);
    const list = kids(node);
    // AccessDescription: a method, then where.
    const methodHere = list[0] && oidOf(f, list[0]);
    for (const kid of list) walk(kid, ok && (!method || !methodHere || methodHere === method));
  };
  walk(read(f, found.value), true);
  return out.filter((uri) => /^https?:/i.test(uri));
}

// --- Signed data ------------------------------------------------------------------------

export interface SignedDataInput {
  key: forgeType.pki.rsa.PrivateKey;
  /** The signer's first. */
  certificates: Certificate[];
  /** The digest, by SHA-256, of what is signed. */
  digest: string;
  /** PAdES (CAdES): the signer's certificate named by its digest, and no time of signing, which the PDF says. Or as PKCS #7 has it. */
  pades: boolean;
  date?: Date;
  /** What is signed, carried in it (as a time-stamp carries what it says); left out of it when not given. */
  content?: { type: string; der: string };
}

/** CMS signed data, as a ContentInfo: signed by SHA-256 with RSA, with its certificates. */
export function signedData(f: Forge, input: SignedDataInput): Asn1 {
  const a = asn1(f);
  const [mine] = input.certificates;
  const contentType = input.content?.type ?? OIDS.data;
  const attributes = [
    a.attribute(OIDS.contentType, a.oid(contentType)),
    a.attribute(OIDS.messageDigest, a.octets(input.digest)),
    ...(input.pades
      ? [a.attribute(OIDS.signingCertificateV2, a.seq(a.seq(a.seq(a.octets(digest(f, OIDS.sha256, a.der(f.pki.certificateToAsn1(mine))))))))]
      : [a.attribute(OIDS.signingTime, a.utc(input.date ?? new Date()))]),
  ].sort((x, y) => (a.der(x) < a.der(y) ? -1 : 1));
  const md = f.md.sha256.create();
  md.update(a.der(a.set(...attributes)));
  const signature = input.key.sign(md);
  const own = certOf(f, mine);
  const signer = a.seq(a.int(1), a.seq(read(f, own.issuer), own.serial), a.alg(OIDS.sha256), a.ctx(0, attributes), a.alg(OIDS.rsa), a.octets(signature));
  const encapsulated = input.content ? a.seq(a.oid(contentType), a.ctx(0, [a.octets(input.content.der)])) : a.seq(a.oid(contentType));
  const data = a.seq(
    a.int(input.content ? 3 : 1),
    a.set(a.alg(OIDS.sha256)),
    encapsulated,
    a.ctx(
      0,
      input.certificates.map((c) => f.pki.certificateToAsn1(c)),
    ),
    a.set(signer),
  );
  return a.seq(a.oid(OIDS.signedData), a.ctx(0, [data]));
}

const signedDataOf = (contentInfo: Asn1) => kids(kids(kids(contentInfo)[1])[0]);
const signerOf = (contentInfo: Asn1) => kids(kids(signedDataOf(contentInfo).at(-1))[0]);

/** Signed data read from its bytes. */
export const readContentInfo = (f: Forge, der: string) => read(f, der);

/** The signature value of the first signer of signed data. */
export function signatureValueOf(f: Forge, contentInfo: Asn1): string {
  return signerOf(contentInfo).find((p) => p.tagClass === f.asn1.Class.UNIVERSAL && p.type === f.asn1.Type.OCTETSTRING)!.value as string;
}

/** A time-stamp put in signed data, after what its signer signed: as when it was signed, vouched for by an authority. */
export function addTimestamp(f: Forge, contentInfo: Asn1, token: Asn1): void {
  const a = asn1(f);
  const signer = signerOf(contentInfo);
  const unsigned = signer.find((p) => isCtx(f, p, 1));
  const attribute = a.attribute(OIDS.timeStampToken, token);
  if (unsigned) (unsigned.value as Asn1[]).push(attribute);
  else signer.push(a.ctx(1, [attribute]));
}

/** What signed data has: its certificates, its signer, what it carries. */
export function readSignedData(f: Forge, contentInfo: Asn1) {
  const parts = signedDataOf(contentInfo);
  const certificates: Cert[] = [];
  for (const node of kids(parts.find((p) => isCtx(f, p, 0)))) {
    try {
      // Certificates alone: not attribute certificates, which are tagged.
      if (node.tagClass === f.asn1.Class.UNIVERSAL) certificates.push(readCert(f, node));
    } catch {
      // Not a certificate this reads.
    }
  }
  const carried = kids(kids(parts[2])[1])[0];
  return {
    certificates,
    signer: signerOf(contentInfo),
    content: carried
      ? carried.constructed
        ? kids(carried)
            .map((k) => k.value as string)
            .join('')
        : (carried.value as string)
      : undefined,
  };
}

export interface SignerCheck {
  certificate?: Cert;
  certificates: Cert[];
  intact: boolean;
  problem?: string;
  /** When it says it was signed, if it says. */
  date?: Date;
  /** The time-stamps after it, as ContentInfos. */
  timestamps: Asn1[];
  signatureValue: string;
}

/** Checks the signer of signed data against what it signed: that its digest is of it, and that its certificate's key made it. */
export async function checkSigner(f: Forge, contentInfo: Asn1, data: string): Promise<SignerCheck> {
  const { certificates, signer } = readSignedData(f, contentInfo);
  const digestOid = oidOf(f, kids(signer[2])[0]);
  // Its certificate: named by its issuer and serial number, or by the identifier of its key.
  const sid = signer[1];
  const certificate = isCtx(f, sid, 0)
    ? certificates.find((c) => c.keyId === f.util.bytesToHex(sid.value as string))
    : certificates.find((c) => c.serialHex === hexOf(f, kids(sid)[1]) && c.issuer === f.asn1.toDer(kids(sid)[0]).getBytes());
  const attributes = signer.find((p) => isCtx(f, p, 0));
  const algorithm = signer[attributes ? 4 : 3];
  const signatureValue = (signer.find((p) => p.tagClass === f.asn1.Class.UNIVERSAL && p.type === f.asn1.Type.OCTETSTRING)?.value as string) ?? '';
  const timestamps: Asn1[] = [];
  for (const attribute of kids(signer.find((p) => isCtx(f, p, 1)))) {
    const [id, values] = kids(attribute);
    if (oidOf(f, id) === OIDS.timeStampToken) timestamps.push(...kids(values));
  }
  const check: SignerCheck = { certificate, certificates, intact: false, timestamps, signatureValue };
  try {
    let signed = data;
    if (attributes) {
      const list = kids(attributes);
      let digested = false;
      for (const attribute of list) {
        const [id, values] = kids(attribute);
        const first = kids(values)[0];
        const type = oidOf(f, id);
        if (type === OIDS.messageDigest) {
          if (first.value !== digest(f, digestOid, data)) throw new Error('The bytes signed are not as they were signed: the file was changed.');
          digested = true;
        }
        if (type === OIDS.signingTime) check.date = timeOf(f, first);
      }
      if (!digested) throw new Error('It says nothing of what it signed.');
      // What was signed is its attributes, as a set.
      signed = f.asn1.toDer(f.asn1.create(f.asn1.Class.UNIVERSAL, f.asn1.Type.SET, true, list)).getBytes();
    }
    if (!certificate) throw new Error('It carries no certificate.');
    if (!(await verifySignature(f, certificate.spki, algorithm, signed, signatureValue, digestOid))) throw new Error('It was not made by the key of its certificate.');
    check.intact = true;
  } catch (error) {
    check.problem = error instanceof Error ? error.message : String(error);
  }
  return check;
}

// --- Time-stamps (RFC 3161) ------------------------------------------------------

/** Asks an authority for a time-stamp of these bytes: given what to ask, it gives what it answers. */
export type TimestampAuthority = (request: Uint8Array) => Promise<Uint8Array>;

/** An authority by its address: asked by HTTP, as RFC 3161 says. */
export function authorityAt(url: string, fetcher: typeof fetch = fetch): TimestampAuthority {
  return async (request) => {
    const response = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/timestamp-query' }, body: request as BodyInit });
    if (!response.ok) throw new Error(`The time-stamping authority said ${response.status}.`);
    return new Uint8Array(await response.arrayBuffer());
  };
}

/** A time-stamp of data (as forge holds it), asked of an authority, as the token it answers. */
export async function timestamp(f: Forge, authority: TimestampAuthority, data: string): Promise<Asn1> {
  const a = asn1(f);
  const nonce = f.random.getBytesSync(8);
  const request = a.seq(a.int(1), a.seq(a.alg(OIDS.sha256), a.octets(digest(f, OIDS.sha256, data))), a.bigInt(nonce), a.bool(true));
  const answer = await authority(bytesOf(a.der(request)));
  const [status, token] = kids(read(f, binary(answer)));
  const code = (kids(status)[0]?.value as string)?.charCodeAt(0) ?? 2;
  if (code > 1 || !token) throw new Error('The time-stamping authority gave no time-stamp.');
  const info = readTimestamp(f, token);
  if (info.imprint !== digest(f, info.imprintAlgorithm, data)) throw new Error('The time-stamp is not of what was asked.');
  return token;
}

/** What a time-stamp says: when, of what digest. */
export function readTimestamp(f: Forge, token: Asn1) {
  const { content } = readSignedData(f, token);
  const info = kids(read(f, content ?? ''));
  const imprint = kids(info[2]);
  return { imprintAlgorithm: oidOf(f, kids(imprint[0])[0]), imprint: imprint[1]?.value as string, date: timeOf(f, info[4])!, content: content ?? '' };
}

/** Checks a time-stamp of data: that it is of it, and that its authority made it. */
export async function checkTimestamp(f: Forge, token: Asn1, data: string) {
  const info = readTimestamp(f, token);
  const signer = await checkSigner(f, token, info.content);
  const of = info.imprint === digest(f, info.imprintAlgorithm, data);
  return {
    date: info.date,
    authority: signer.certificate,
    intact: signer.intact && of,
    problem: !of ? 'The time-stamp is not of what was signed.' : signer.problem,
    certificates: signer.certificates,
  };
}

// --- Revocation: OCSP and CRLs ------------------------------------------------------

/** What to ask an OCSP responder of a certificate, by its issuer. */
export function ocspRequest(f: Forge, c: Cert, issuer: Cert): Uint8Array {
  const a = asn1(f);
  const id = a.seq(a.alg(OIDS.sha1), a.octets(digest(f, OIDS.sha1, issuer.subject)), a.octets(digest(f, OIDS.sha1, issuer.keyBits)), c.serial);
  return bytesOf(a.der(a.seq(a.seq(a.seq(a.seq(id))))));
}

export type Revocation = 'good' | 'revoked' | 'unknown';

/** What an OCSP answer says of a certificate, if it is of it and its issuer (or a responder the issuer named) made it. */
export async function readOcsp(f: Forge, answer: Uint8Array, c: Cert, issuer: Cert): Promise<{ status: Revocation; date?: Date } | undefined> {
  try {
    const response = kids(read(f, binary(answer)));
    if ((response[0]?.value as string)?.charCodeAt(0) !== 0) return undefined;
    const bytes = kids(kids(response[1])[0]);
    if (oidOf(f, bytes[0]) !== OIDS.ocspBasic) return undefined;
    const basic = kids(read(f, bytes[1].value as string));
    const [data, algorithm, signature] = basic;
    const parts = kids(data);
    const at = isCtx(f, parts[0], 0) ? 1 : 0;
    const produced = timeOf(f, parts[at + 1]);
    const single = kids(parts[at + 2]).find((s) => hexOf(f, kids(kids(s)[0])[3]) === c.serialHex);
    if (!single) return undefined;
    // Who made it: the issuer, or a responder of a certificate it issued.
    const responders: Cert[] = [];
    for (const node of kids(kids(basic.find((p) => isCtx(f, p, 0)))[0])) {
      try {
        const responder = readCert(f, node);
        if (await issuedBy(f, responder, issuer)) responders.push(responder);
      } catch {
        // Not a certificate this reads.
      }
    }
    const signed = f.asn1.toDer(data).getBytes();
    let made = false;
    for (const signer of [issuer, ...responders]) if (!made) made = await verifySignature(f, signer.spki, algorithm, signed, bitsOf(f, signature));
    if (!made) return undefined;
    const status = kids(single)[1];
    return { status: isCtx(f, status, 0) ? 'good' : isCtx(f, status, 1) ? 'revoked' : 'unknown', date: produced };
  } catch {
    return undefined;
  }
}

/** What a CRL says of a certificate, if its issuer made it. */
export async function readCrl(f: Forge, crl: Uint8Array, c: Cert, issuer: Cert): Promise<{ status: Revocation; date?: Date } | undefined> {
  try {
    const [list, algorithm, signature] = kids(read(f, binary(crl)));
    if (!(await verifySignature(f, issuer.spki, algorithm, f.asn1.toDer(list).getBytes(), bitsOf(f, signature)))) return undefined;
    const parts = kids(list);
    const at = parts[0]?.type === f.asn1.Type.INTEGER ? 1 : 0;
    if (f.asn1.toDer(parts[at + 1]).getBytes() !== issuer.subject) return undefined;
    const date = timeOf(f, parts[at + 2]);
    const revoked = parts.slice(at + 3).find((p) => p.type === f.asn1.Type.SEQUENCE && kids(p).every((k) => k.type === f.asn1.Type.SEQUENCE));
    return { status: kids(revoked).some((entry) => hexOf(f, kids(entry)[0]) === c.serialHex) ? 'revoked' : 'good', date };
  } catch {
    return undefined;
  }
}
