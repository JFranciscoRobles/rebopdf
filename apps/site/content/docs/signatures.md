# Signatures

## A picture of a signature

The Sign tool (S) asks for a signature drawn, typed or a picture, and puts it where you click; a signature field of the PDF says Sign here, and puts it in its box. It is drawn into the page.

## Digital signatures

Signing digitally proves who signed and that nothing changed after: Sign digitally… in the menu, or in code:

```ts
import { signPdf, checkSignatures } from '@rebopdf/core';

const signed = await signPdf(pdf, { p12, password, reason: 'I agree', field: 'Client' });
// Or as Mexico's e.firma comes:
const signed2 = await signPdf(pdf, { certificate: cer, key, password });
```

The signature is a PAdES one (CAdES, detached, with SHA-256), as Acrobat and every reader of signatures checks them; `format: 'pkcs7'` makes it as readers before 2009 read them. It goes in a signature field of the PDF (seen in its box with who signed and when), or in one not seen. RSA keys to sign with. The certificate never leaves the browser.

## When it was signed, vouched for

A time-stamping authority (RFC 3161) vouches for when it was signed, so the time is not only what the signer's computer said:

```ts
const signed = await signPdf(pdf, { p12, password, timestamp: 'https://freetsa.org/tsr' });
```

`timestamp` is the address of the authority, or a function given what to ask that gives what it answers. Most authorities do not answer pages of other sites: in the browser, ask through a server of yours (the editor takes `signing: { timestamp, fetch }` for it).

## Signatures that hold for years

A certificate expires and may be revoked; years after, what proves it was good when the PDF was signed has to be in the file. `addValidationData` puts it there (PAdES LT): the chain of each certificate, and whether each was revoked, as its authority answers (OCSP) or lists (CRL), asked at the addresses the certificate gives. `timestampPdf` then time-stamps the whole file (PAdES LTA), which keeps all of it checkable after the certificates expire:

```ts
import { addValidationData, timestampPdf } from '@rebopdf/core';

let bytes = await signPdf(pdf, { p12, password, timestamp: tsa });
bytes = await addValidationData(bytes);
bytes = await timestampPdf(bytes, { timestamp: tsa });
```

In the editor, Sign digitally has a field for the authority and a box to keep what checks it.

## Signatures checked

```ts
for (const check of await checkSignatures(bytes, { trusted: [satRoot] })) {
  check.intact;     // what it signed is as it was signed, and its key made it
  check.whole;      // it signed the whole file: nothing was added after it
  check.timestamp;  // when an authority vouches it was signed
  check.chain;      // its certificates, from the signer's up
  check.revocation; // 'good', 'revoked' or 'unknown', as the file says
  check.longTerm;   // the file carries what checks it for years
  check.trusted;    // given who to trust: its chain ends in one of them
}
```

Who to trust is yours to give: the certificates of the authorities (for e.firma, the SAT's, which it publishes). Keys of RSA (PKCS #1 and PSS) and of elliptic curves are checked, with the Web Crypto of the browser or of Node.

## Signed PDFs stay signed

A signed PDF is saved by adding to its file (`incremental`): its bytes stay as they came, so its signatures still hold, and the changes after them show apart. A second signature keeps the first. When that cannot be (pages of another PDF put in, something blacked out), the editor says the signature no longer holds.
