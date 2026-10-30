import { beforeAll, describe, expect, it } from 'vitest';
import { addValidationData, checkSignatures, openPdf, samplePdf, savePdf, setField, signPdf, timestampPdf } from '../src';
import { makePki, type Pki } from './pki';

let pki: Pki;
let other: Pki;
beforeAll(() => {
  pki = makePki();
  other = makePki('Some Other Root');
});

describe('signatures to hold in the long term', () => {
  it('signs as PAdES, with a time-stamp an authority vouches for', async () => {
    const ana = pki.person('Ana García', 'secreto');
    const bytes = await signPdf(await samplePdf('en'), { p12: ana.p12, password: ana.password, timestamp: pki.tsa });
    const [check] = await checkSignatures(bytes);
    expect(check).toMatchObject({ kind: 'signature', format: 'pades', intact: true, whole: true, signer: 'Ana García', chain: ['Ana García', 'Rebo Test Root'] });
    expect(check.timestamp).toMatchObject({ authority: 'Rebo Test TSA', intact: true });
    expect(Math.abs(new Date(check.timestamp!.date).getTime() - Date.now())).toBeLessThan(60_000);
  }, 60_000);

  it('still signs as PKCS #7 when asked', async () => {
    const ana = pki.person('Ana García', 'secreto');
    const [check] = await checkSignatures(await signPdf(await samplePdf('en'), { p12: ana.p12, password: ana.password, format: 'pkcs7', reason: 'Old readers' }));
    expect(check).toMatchObject({ format: 'pkcs7', intact: true, reason: 'Old readers' });
  }, 60_000);

  it('puts in the file whether its certificates were revoked, and trusts its chain given its root', async () => {
    const ana = pki.person('Ana García', 'secreto');
    const signed = await signPdf(await samplePdf('en'), { p12: ana.p12, password: ana.password, timestamp: pki.tsa });
    const [before] = await checkSignatures(signed, { trusted: [pki.rootDer] });
    expect(before).toMatchObject({ trusted: true, revocation: 'unknown', longTerm: false });

    const kept = await addValidationData(signed, { fetch: pki.fetch });
    expect(pki.asked['http://ocsp.rebo.test/']).toBeGreaterThan(0);
    const [after] = await checkSignatures(kept, { trusted: [pki.rootDer] });
    expect(after).toMatchObject({ intact: true, whole: false, trusted: true, revocation: 'good', longTerm: true });
    // Asked again, nothing new is put in.
    expect((await addValidationData(kept, { fetch: pki.fetch })).length - kept.length).toBeLessThan(600);

    // Of an authority not trusted, it is not.
    const [elsewhere] = await checkSignatures(kept, { trusted: [other.rootDer] });
    expect(elsewhere).toMatchObject({ intact: true, trusted: false });
    expect(elsewhere.problem).toMatch(/Rebo Test Root, which is not trusted/);
  }, 60_000);

  it('reads the list of certificates revoked when there is no answer to ask', async () => {
    const ana = pki.person('Ana García', 'secreto');
    const signed = await signPdf(await samplePdf('en'), { p12: ana.p12, password: ana.password });
    const noOcsp = ((input: string | URL | Request, init?: RequestInit) =>
      String(input).includes('ocsp') ? Promise.resolve(new Response('', { status: 503 })) : pki.fetch(input, init)) as typeof fetch;
    const [check] = await checkSignatures(await addValidationData(signed, { fetch: noOcsp }), { trusted: [pki.rootDer] });
    expect(check).toMatchObject({ trusted: true, revocation: 'good', longTerm: true });
  }, 60_000);

  it('finds a certificate revoked', async () => {
    const luis = pki.person('Luis Pérez', 'clave');
    const signed = await signPdf(await samplePdf('en'), { p12: luis.p12, password: luis.password });
    pki.revoke(luis.cert);
    const [check] = await checkSignatures(await addValidationData(signed, { fetch: pki.fetch }), { trusted: [pki.rootDer] });
    expect(check).toMatchObject({ intact: true, revocation: 'revoked', trusted: false, longTerm: false });
    expect(check.problem).toMatch(/revoked/);
  }, 60_000);

  it('time-stamps the whole file, after what checks its signatures, and they hold', async () => {
    const ana = pki.person('Ana García', 'secreto');
    const signed = await signPdf(await samplePdf('en'), { p12: ana.p12, password: ana.password, timestamp: pki.tsa });
    const filled = await savePdf(setField(await openPdf(signed), 'client.name', 'Ana García'));
    const stamped = await timestampPdf(await addValidationData(filled, { fetch: pki.fetch }), { timestamp: pki.tsa });
    const checks = await checkSignatures(stamped, { trusted: [pki.rootDer] });
    expect(checks).toHaveLength(2);
    expect(checks[0]).toMatchObject({ kind: 'signature', intact: true, whole: false, trusted: true });
    expect(checks[1]).toMatchObject({ kind: 'timestamp', format: 'rfc3161', intact: true, whole: true, signer: 'Rebo Test TSA', trusted: true });
    // The time-stamp too is put in the store of what checks it.
    const [, stamp] = await checkSignatures(await addValidationData(stamped, { fetch: pki.fetch }), { trusted: [pki.rootDer] });
    expect(stamp).toMatchObject({ revocation: 'good', longTerm: true });
  }, 60_000);

  it('says in words when no time-stamp could be had', async () => {
    const ana = pki.person('Ana García', 'secreto');
    await expect(signPdf(await samplePdf('en'), { p12: ana.p12, password: ana.password, timestamp: async () => new Uint8Array([48, 3, 2, 1, 2]) })).rejects.toThrow(/No time-stamp could be had/);
  }, 60_000);
});
