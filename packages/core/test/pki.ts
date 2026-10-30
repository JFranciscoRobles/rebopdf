// A small world of certificates to sign and check with: an authority, the
// people it gives certificates to, a time-stamping authority, and what
// answers whether a certificate was revoked (OCSP, and a CRL), reached by a
// fetch of its own instead of the network.

import forge from 'node-forge';
import { asn1, binary, bytesOf, certOf, digest, OIDS, signedData } from '../src/cms';

const f = forge;
const a = asn1(f);
const toBytes = (der: string) => bytesOf(der);
const SHA256_RSA = '1.2.840.113549.1.1.11';
let serial = 0x10;

export const OCSP_URL = 'http://ocsp.rebo.test/';
export const CRL_URL = 'http://crl.rebo.test/root.crl';
export const TSA_URL = 'http://tsa.rebo.test/';

function certificate(cn: string, keys: forge.pki.rsa.KeyPair, issuer: { cert?: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey }, extensions: object[]) {
  const cert = f.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = (serial++).toString(16).padStart(4, '0');
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  cert.setSubject([
    { name: 'commonName', value: cn },
    { name: 'countryName', value: 'MX' },
  ]);
  cert.setIssuer(issuer.cert ? issuer.cert.subject.attributes : cert.subject.attributes);
  cert.setExtensions(extensions);
  cert.sign(issuer.key, f.md.sha256.create());
  return cert;
}

/** Where to ask of a certificate: OCSP, and the CRL. */
const addresses = () => [
  { id: OIDS.authorityInfoAccess, value: a.seq(a.seq(a.oid(OIDS.ocsp), a.ctx(6, OCSP_URL))) },
  { id: OIDS.crlDistributionPoints, value: a.seq(a.seq(a.ctx(0, [a.ctx(0, [a.ctx(6, CRL_URL)])]))) },
];

export interface Pki {
  root: forge.pki.Certificate;
  rootDer: Uint8Array;
  person(cn: string, password: string): { p12: Uint8Array; password: string; cert: forge.pki.Certificate };
  /** A time-stamping authority, as given to `signPdf` and `timestampPdf`. */
  tsa: (request: Uint8Array) => Promise<Uint8Array>;
  /** What answers at the addresses of the certificates. */
  fetch: typeof fetch;
  revoke(cert: forge.pki.Certificate): void;
  /** How many times each address was asked. */
  asked: Record<string, number>;
}

export function makePki(name = 'Rebo Test Root'): Pki {
  const rootKeys = f.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const root = certificate(name, rootKeys, { key: rootKeys.privateKey }, [
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true, critical: true },
  ]);
  const tsaKeys = f.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const tsaCert = certificate('Rebo Test TSA', tsaKeys, { cert: root, key: rootKeys.privateKey }, [
    { name: 'extKeyUsage', timeStamping: true, critical: true },
    { name: 'keyUsage', digitalSignature: true, critical: true },
    ...addresses(),
  ]);
  const revoked = new Set<string>();
  const asked: Record<string, number> = {};
  const sign = (der: string) => {
    const md = f.md.sha256.create();
    md.update(der);
    return rootKeys.privateKey.sign(md);
  };

  const ocsp = (request: Uint8Array) => {
    const id = (f.asn1.fromDer(binary(request)).value as forge.asn1.Asn1[])[0];
    const certId = (((id.value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[])[0];
    const serialHex = f.util.bytesToHex((certId.value as forge.asn1.Asn1[])[3].value as string).replace(/^(00)+/, '');
    const status = revoked.has(serialHex) ? a.ctx(1, [a.time(new Date(Date.now() - 3600_000))]) : a.ctx(0, '');
    const data = a.seq(a.ctx(1, [f.asn1.fromDer(certOf(f, root).subject)]), a.time(new Date()), a.seq(a.seq(certId, status, a.time(new Date()))));
    const basic = a.seq(data, a.alg(SHA256_RSA), a.bits(sign(a.der(data))));
    return toBytes(a.der(a.seq(a.enumerated(0), a.ctx(0, [a.seq(a.oid(OIDS.ocspBasic), a.octets(a.der(basic)))]))));
  };
  const crl = () => {
    const entries = [...revoked].map((hex) => a.seq(a.bigInt(f.util.hexToBytes(hex.length % 2 ? `0${hex}` : hex)), a.utc(new Date(Date.now() - 3600_000))));
    const list = a.seq(
      a.int(1),
      a.alg(SHA256_RSA),
      f.asn1.fromDer(certOf(f, root).subject),
      a.utc(new Date()),
      a.utc(new Date(Date.now() + 86_400_000)),
      ...(entries.length ? [a.seq(...entries)] : []),
    );
    return toBytes(a.der(a.seq(list, a.alg(SHA256_RSA), a.bits(sign(a.der(list))))));
  };

  const tsa = async (request: Uint8Array) => {
    const parts = f.asn1.fromDer(binary(request)).value as forge.asn1.Asn1[];
    const info = a.seq(a.int(1), a.oid('1.3.6.1.4.1.99999.1'), parts[1], a.int(serial++), a.time(new Date()), ...(parts[2]?.type === f.asn1.Type.INTEGER ? [parts[2]] : []));
    const der = a.der(info);
    const token = signedData(f, { key: tsaKeys.privateKey, certificates: [tsaCert, root], digest: digest(f, OIDS.sha256, der), pades: true, content: { type: OIDS.tstInfo, der } });
    return toBytes(a.der(a.seq(a.seq(a.int(0)), token)));
  };

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    asked[url] = (asked[url] ?? 0) + 1;
    const body = init?.body as Uint8Array | undefined;
    if (url === OCSP_URL && body) return new Response(ocsp(body) as BodyInit);
    if (url === CRL_URL) return new Response(crl() as BodyInit);
    if (url === TSA_URL && body) return new Response((await tsa(body)) as BodyInit);
    return new Response('', { status: 404 });
  }) as typeof fetch;

  return {
    root,
    rootDer: toBytes(a.der(f.pki.certificateToAsn1(root))),
    person(cn, password) {
      const keys = f.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
      const cert = certificate(cn, keys, { cert: root, key: rootKeys.privateKey }, [{ name: 'keyUsage', digitalSignature: true, nonRepudiation: true, critical: true }, ...addresses()]);
      const p12 = toBytes(f.asn1.toDer(f.pkcs12.toPkcs12Asn1(keys.privateKey, [cert, root], password, { algorithm: '3des' })).getBytes());
      return { p12, password, cert };
    },
    tsa,
    fetch: fetcher,
    revoke(cert) {
      revoked.add(cert.serialNumber.toLowerCase().replace(/^(00)+/, ''));
    },
    asked,
  };
}
