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

La firma es PAdES (CAdES desacoplada, con SHA-256), como la verifican Acrobat y cualquier lector de firmas; `format: 'pkcs7'` la hace como la leen los lectores anteriores a 2009. Va en un campo de firma del PDF (visible en su recuadro con quién firmó y cuándo), o en uno que no se ve. Se firma con claves RSA. El certificado nunca sale del navegador.

## Cuándo se firmó, con fe de una autoridad

Una autoridad de sellado de tiempo (RFC 3161) da fe de cuándo se firmó, para que la hora no sea solo la que decía la computadora de quien firma:

```ts
const firmado = await signPdf(pdf, { p12, password, timestamp: 'https://freetsa.org/tsr' });
```

`timestamp` es la dirección de la autoridad, o una función que recibe la solicitud y devuelve la respuesta. La mayoría de las autoridades no responde a páginas de otros sitios: en el navegador, pregúntale a través de un servidor tuyo (el editor recibe `signing: { timestamp, fetch }` para eso).

## Firmas que valen por años

Un certificado caduca y puede revocarse; años después, lo que prueba que era válido al firmar tiene que estar en el archivo. `addValidationData` lo guarda (PAdES LT): la cadena de cada certificado y si alguno fue revocado, según responde su autoridad (OCSP) o lo lista (CRL), preguntado en las direcciones que trae el certificado. Después, `timestampPdf` sella todo el archivo (PAdES LTA), lo que mantiene todo verificable cuando los certificados ya caducaron:

```ts
import { addValidationData, timestampPdf } from '@rebopdf/core';

let bytes = await signPdf(pdf, { p12, password, timestamp: tsa });
bytes = await addValidationData(bytes);
bytes = await timestampPdf(bytes, { timestamp: tsa });
```

En el editor, Firmar digitalmente tiene un campo para la autoridad y una casilla para guardar lo que la verifica.

## Verificar firmas

```ts
for (const verificacion of await checkSignatures(bytes, { trusted: [raizSat] })) {
  verificacion.intact;     // lo firmado está como se firmó, y lo hizo su clave
  verificacion.whole;      // firmó el archivo completo: no se añadió nada después
  verificacion.timestamp;  // cuándo se firmó, con fe de una autoridad
  verificacion.chain;      // sus certificados, del de quien firma hacia arriba
  verificacion.revocation; // 'good', 'revoked' o 'unknown', según el archivo
  verificacion.longTerm;   // el archivo trae lo que la verifica por años
  verificacion.trusted;    // con en quién confiar: su cadena termina en una de ellas
}
```

En quién confiar lo das tú: los certificados de las autoridades (para la e.firma, los del SAT, que los publica). Se verifican claves RSA (PKCS #1 y PSS) y de curvas elípticas, con el Web Crypto del navegador o de Node.

## Los PDF firmados siguen firmados

Un PDF firmado se guarda añadiendo a su archivo (`incremental`): sus bytes quedan como llegaron, así sus firmas siguen valiendo, y los cambios posteriores se ven aparte. Una segunda firma conserva la primera. Cuando eso no se puede (se añadieron páginas de otro PDF, o se tachó algo), el editor avisa que la firma ya no vale.
