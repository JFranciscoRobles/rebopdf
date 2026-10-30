// Runs the server for an assistant to connect to, over standard input and
// output: the way a client such as Claude Desktop or Claude Code starts one.
//
//   vite-node packages/mcp/src/main.ts [--root carpeta]… [--font fuente.ttf]
//
// Standard output carries the protocol and nothing else; what there is to say
// to a person goes to standard error.

import { createInterface } from 'node:readline';
import { createPdfServer } from './server';

const args = process.argv.slice(2);
const roots: string[] = [];
for (let i = args.indexOf('--root'); i >= 0; i = args.indexOf('--root')) roots.push(...args.splice(i, 2).slice(1));
const at = args.indexOf('--font');
const font = at >= 0 ? args.splice(at, 2)[1] : undefined;
if (args.length) {
  console.error('Uso: main.ts [--root carpeta]… [--font fuente.ttf]');
  process.exit(2);
}

const server = createPdfServer({ roots, font });
console.error(`rebopdf-mcp: listo.${roots.length ? ` Carpetas permitidas: ${roots.join(', ')}.` : ''}`);

const send = (message: object) => process.stdout.write(`${JSON.stringify(message)}\n`);
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', (line) => {
  if (!line.trim()) return;
  let message: Parameters<typeof server.handle>[0];
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  void server
    .handle(message)
    .then((answer) => answer && send(answer))
    .catch((error: unknown) => send({ jsonrpc: '2.0', id: message.id ?? null, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } }));
});
// The client closing its end is how it says it is done.
lines.on('close', () => process.exit(0));
