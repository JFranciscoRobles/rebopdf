# Firmas

## Una imagen de la firma

La herramienta Firmar (S) pide una firma dibujada, escrita o en imagen, y la pone donde haces clic; un campo de firma del PDF dice Firmar aquí y la pone en su recuadro. Se dibuja en la página.

## Firmas digitales

Firmar digitalmente prueba quién firmó y que nada cambió después: Firmar digitalmente… en el menú, o en código:

```ts
import { signPdf, checkSignatures } from '@rebopdf/core';

const firmado = await signPdf(pdf, { p12, password, reason: 'Estoy de acuerdo', field: 'Cliente' });
// O como viene la e.firma del SAT:
const firmado2 = await signPdf(pdf, { certificate: cer, key, password });
```

La firma es PKCS #7, desacoplada, con SHA-256, como la verifican Acrobat y cualquier lector de firmas. Va en un campo de firma del PDF (visible en su recuadro con quién firmó y cuándo), o en uno que no se ve. Solo claves RSA. El certificado nunca sale del navegador.

## Verificar firmas

```ts
for (const verificacion of await checkSignatures(bytes)) {
  verificacion.intact; // lo firmado está como se firmó, y lo hizo su clave
  verificacion.whole;  // firmó el archivo completo: no se añadió nada después
  verificacion.signer; verificacion.issuer; verificacion.date;
}
```

En quién confiar lo dice el lector: no se verifican las autoridades que emitieron los certificados.

## Los PDF firmados siguen firmados

Un PDF firmado se guarda añadiendo a su archivo (`incremental`): sus bytes quedan como llegaron, así sus firmas siguen valiendo, y los cambios posteriores se ven aparte. Una segunda firma conserva la primera. Cuando eso no se puede (se añadieron páginas de otro PDF, o se tachó algo), el editor avisa que la firma ya no vale.
