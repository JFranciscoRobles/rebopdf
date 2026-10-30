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

The signature is a PKCS #7 one, detached, with SHA-256, as Acrobat and every reader of signatures checks them. It goes in a signature field of the PDF (seen in its box with who signed and when), or in one not seen. RSA keys only. The certificate never leaves the browser.

## Signatures checked

```ts
for (const check of await checkSignatures(bytes)) {
  check.intact; // what it signed is as it was signed, and its key made it
  check.whole;  // it signed the whole file: nothing was added after it
  check.signer; check.issuer; check.date;
}
```

Who to trust is a reader's to say: the authorities that gave the certificates are not checked.

## Signed PDFs stay signed

A signed PDF is saved by adding to its file (`incremental`): its bytes stay as they came, so its signatures still hold, and the changes after them show apart. A second signature keeps the first. When that cannot be (pages of another PDF put in, something blacked out), the editor says the signature no longer holds.
