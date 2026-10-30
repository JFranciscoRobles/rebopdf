import forge from 'node-forge';
import { beforeAll, describe, expect, it } from 'vitest';
import { addField, addMark, checkSignatures, openPdf, PdfError, samplePdf, savePdf, setField, signPdf } from '../src';

const toBytes = (der: string) => Uint8Array.from(der, (c) => c.charCodeAt(0));

/** A person with a certificate of their own: as a .p12, and as e.firma comes (.cer and an encrypted .key). */
function identity(cn: string, password: string) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '0a1b2c';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const attrs = [
    { name: 'commonName', value: cn },
    { name: 'countryName', value: 'MX' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer([{ name: 'commonName', value: 'Rebo Test CA' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = toBytes(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' })).getBytes());
  const certificate = toBytes(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
  const info = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keys.privateKey));
  const key = toBytes(forge.asn1.toDer(forge.pki.encryptPrivateKeyInfo(info, password, { algorithm: 'aes256' })).getBytes());
  return { p12, certificate, key, password };
}

let ana: ReturnType<typeof identity>;
let luis: ReturnType<typeof identity>;
beforeAll(() => {
  ana = identity('Ana García', 'secreto');
  luis = identity('Luis Pérez', 'clave');
});

describe('signing with a certificate', () => {
  it('signs the whole file, and the signature is found intact', async () => {
    const pdf = setField(await samplePdf('en'), 'client.name', 'Ana García');
    const bytes = await signPdf(pdf, { p12: ana.p12, password: ana.password, reason: 'I agree', location: 'Monterrey' });
    const [check] = await checkSignatures(bytes);
    expect(check).toMatchObject({ field: 'Signature1', intact: true, whole: true, signer: 'Ana García', issuer: 'Rebo Test CA', name: 'Ana García', reason: 'I agree' });
    // Opened, it is a signed PDF whose form is as it was filled.
    const back = await openPdf(bytes);
    expect(back.signatures?.[0]).toMatchObject({ field: 'Signature1', name: 'Ana García', reason: 'I agree' });
    expect(back.fields.find((f) => f.name === 'client.name')?.value).toBe('Ana García');
  }, 60_000);

  it('finds a signature broken by a byte changed', async () => {
    const bytes = await signPdf(await samplePdf('en'), { p12: ana.p12, password: ana.password });
    const text = Buffer.from(bytes).toString('latin1');
    const at = text.indexOf('Service agreement');
    const changed = bytes.slice();
    // A byte of the file signed, outside the signature itself.
    const target = at > 0 ? at : 200;
    changed[target] = changed[target] === 0x41 ? 0x42 : 0x41;
    const [check] = await checkSignatures(changed);
    expect(check.intact).toBe(false);
    expect(check.problem).toMatch(/changed|not made/);
  }, 60_000);

  it('keeps a first signature intact when the PDF is changed and signed again', async () => {
    const first = await signPdf(await samplePdf('en'), { p12: ana.p12, password: ana.password });
    let pdf = await openPdf(first);
    pdf = setField(pdf, 'accept', true);
    pdf = addMark(pdf, { kind: 'note', page: pdf.pages[0].id, at: { x: 500, y: 700 }, text: 'Seen', color: '#f08c00' });
    const second = await signPdf(pdf, { certificate: luis.certificate, key: luis.key, password: luis.password, reason: 'Witness' });
    expect(Buffer.from(second.subarray(0, first.length)).equals(Buffer.from(first))).toBe(true);
    const checks = await checkSignatures(second);
    expect(checks.map((c) => [c.signer, c.intact, c.whole])).toEqual([
      ['Ana García', true, false],
      ['Luis Pérez', true, true],
    ]);
  }, 60_000);

  it('signs in a signature field of the PDF, seen in its box', async () => {
    let pdf = await samplePdf('en');
    pdf = addField(pdf, { kind: 'signature', page: pdf.pages[1].id, rect: { x: 64, y: 200, width: 200, height: 50 }, name: 'Client' });
    const bytes = await signPdf(pdf, { p12: ana.p12, password: ana.password, field: 'Client' });
    expect((await checkSignatures(bytes)).map((c) => [c.field, c.intact])).toEqual([['Client', true]]);
    const back = await openPdf(bytes);
    expect(back.fields.find((f) => f.name === 'Client')).toBeUndefined();
    expect(back.signatures?.map((s) => s.field)).toEqual(['Client']);
    await expect(signPdf(back, { p12: luis.p12, password: luis.password, field: 'Client' })).rejects.toThrow(/signed already/);
  }, 60_000);

  it('says in words what keeps it from signing', async () => {
    const pdf = await samplePdf('en');
    await expect(signPdf(pdf, { p12: ana.p12, password: 'wrong' })).rejects.toMatchObject({ code: 'certificate', message: 'The password is not the one of the certificate.' });
    await expect(signPdf(pdf, { certificate: ana.certificate, key: luis.key, password: luis.password })).rejects.toThrow(/not the one of the certificate/);
    await expect(signPdf(pdf, {})).rejects.toBeInstanceOf(PdfError);
    expect(await checkSignatures(await savePdf(pdf))).toEqual([]);
  }, 60_000);
});
