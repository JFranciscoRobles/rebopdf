// The editor drawn in the hero: a picture of a PDF being worked on, made of
// CSS alone, laid out as the editor comes: the bar with its tools, the
// thumbnails, and a page of an agreement with a sentence highlighted, a note,
// a field filled, an account number blacked out and a signature on its line.
// A note from an assistant floats in beside it.

import type { L } from '@/lib/i18n';
import { getT } from '@/lib/locale';

const TOOLS = ['↖', '▱', '✎', '〰', 'T', '✍', '▬', '☐'];
const CLAUSES: [L, L][] = [
  [
    { en: '1. The work', es: '1. El trabajo' },
    {
      en: 'The provider designs and builds the website described in the proposal, in three rounds of review.',
      es: 'El proveedor diseña y construye el sitio descrito en la propuesta, en tres rondas de revisión.',
    },
  ],
  [
    { en: '2. Payment', es: '2. Pago' },
    { en: 'Half when signed and half on delivery, to the account', es: 'La mitad al firmar y la mitad a la entrega, a la cuenta' },
  ],
];

export function HeroPdf() {
  const t = getT();
  return (
    <div className="relative mx-auto mt-16 max-w-[980px] text-left" aria-hidden="true">
      <div className="overflow-hidden rounded-[22px] border border-border bg-[#efede8] shadow-editor">
        {/* The bar. */}
        <div className="flex items-center gap-1 border-b border-[#e6e3dc] bg-[#fbfaf8] px-3 py-2 text-[13px] text-[#2f2e2b]">
          <span className="mr-2 font-semibold">{t({ en: 'Service agreement', es: 'Contrato de servicios' })}</span>
          <span className="mx-auto hidden gap-1 sm:flex">
            {TOOLS.map((tool, i) => (
              <span key={tool} className={`inline-flex size-7 items-center justify-center rounded-md ${i === 1 ? 'bg-brand-light text-brand' : 'text-[#6b6964]'}`}>
                {tool}
              </span>
            ))}
          </span>
          <span className="ml-auto rounded-md bg-brand px-2.5 py-1 text-[12px] font-semibold text-white">{t({ en: 'Save', es: 'Guardar' })}</span>
        </div>
        <div className="flex gap-3 p-3">
          {/* The thumbnails. */}
          <div className="hidden w-[92px] flex-none flex-col gap-3 sm:flex">
            {[0, 1, 2].map((n) => (
              <div key={n} className={`rounded-lg p-1.5 ${n === 0 ? 'bg-brand-light' : ''}`}>
                <div className="flex h-[96px] flex-col gap-1 bg-white p-2 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
                  {[70, 90, 80, 60, 85].map((w) => (
                    <span key={w} className="h-[3px] rounded bg-[#e6e3dc]" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* The page. */}
          <div className="min-w-0 flex-1 bg-white px-[clamp(18px,5vw,56px)] pb-10 pt-0 text-[13.5px] leading-[1.6] text-[#2f2e2b] shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
            <div className="-mx-[clamp(18px,5vw,56px)] h-1.5 bg-brand" />
            <div className="mt-8 font-display text-[clamp(22px,3vw,30px)] font-extrabold tracking-[-0.02em]">{t({ en: 'Service agreement', es: 'Contrato de servicios' })}</div>
            <p className="mt-3">
              {t({ en: 'This agreement is made between ', es: 'Este contrato se celebra entre ' })}
              <mark className="bg-[#ffe066] px-0.5 text-inherit">{t({ en: 'Rebo Studio and the client', es: 'Rebo Studio y el cliente' })}</mark>
              {t({ en: ' named below, on the terms that follow.', es: ' que se indica abajo, en los términos siguientes.' })}
              <span className="relative -top-1 ml-1 inline-flex size-5 animate-[pop-in_0.4s_ease_1.4s_forwards] items-center justify-center rounded-sm bg-[#f08c00] text-[10px] text-white opacity-0">
                ≡
              </span>
            </p>
            <div className="mt-4 text-[10.5px] font-bold uppercase tracking-wide text-[#6b6964]">{t({ en: 'Full name', es: 'Nombre completo' })}</div>
            <div className="mt-1 rounded-sm border border-[#d4d0c7] bg-[#eef3ff] px-2 py-1">
              <span className="inline-block w-0 animate-[type-command_1s_steps(16,end)_0.6s_forwards] overflow-hidden whitespace-nowrap align-bottom">Ana García López</span>
            </div>
            {CLAUSES.map(([heading, body], i) => (
              <div key={heading.en} className="mt-4">
                <div className="font-bold">{t(heading)}</div>
                <p className="m-0">
                  {t(body)}
                  {i === 1 && (
                    <>
                      {' '}
                      <span className="inline-block h-[1.05em] w-[118px] translate-y-[2px] bg-black align-baseline outline outline-1 outline-[#e03131]" />.
                    </>
                  )}
                </p>
              </div>
            ))}
            <div className="mt-8 flex gap-8">
              <div className="flex-1">
                <div className="h-11 animate-[pop-in_0.5s_ease_2.2s_forwards] font-['Snell_Roundhand','Segoe_Script',cursive] text-[30px] leading-[44px] text-[#0b1f4d] opacity-0">Ana García</div>
                <div className="border-t border-[#2f2e2b] pt-1 text-[12px] text-[#6b6964]">{t({ en: 'The client', es: 'El cliente' })}</div>
              </div>
              <div className="flex-1">
                <div className="flex h-11 items-center justify-center rounded border-[1.5px] border-dashed border-brand text-[12px] font-semibold text-brand">
                  {t({ en: 'Sign here', es: 'Firmar aquí' })}
                </div>
                <div className="border-t border-[#2f2e2b] pt-1 text-[12px] text-[#6b6964]">Rebo Studio</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* A note from an assistant, and a hint by hand; on a phone they would cover the page. */}
      <div className="absolute -right-6 bottom-[110px] z-10 hidden w-[230px] animate-[pop-in_0.5s_cubic-bezier(0.2,0.8,0.2,1)_3s_forwards,float_6s_ease-in-out_3.5s_infinite] rounded-[14px] border border-border bg-white px-3.5 py-3 text-[13px] leading-[1.45] opacity-0 shadow-[0_14px_30px_rgba(47,46,43,0.12)] md:block">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-pastel-pink text-[11px] font-bold text-pastel-pink-fg">C</span>
          <span className="font-semibold">Claude</span>
          <span className="text-ink-soft">· {t({ en: 'via MCP', es: 'vía MCP' })}</span>
        </div>
        <div className="mt-1.5 text-ink-soft">{t({ en: 'Filled the form and blacked out the account number, for good.', es: 'Rellenó el formulario y tachó el número de cuenta, para siempre.' })}</div>
      </div>
      <div className="absolute -left-[30px] -bottom-[22px] z-10 hidden animate-[pop-in_0.5s_cubic-bezier(0.2,0.8,0.2,1)_3.6s_forwards,float_8s_ease-in-out_4.1s_infinite] rounded-[14px] bg-pastel-yellow px-4 py-2.5 opacity-0 md:block">
        <span className="font-hand text-2xl font-semibold text-pastel-yellow-fg">{t({ en: 'drop a PDF to join it', es: 'suelta un PDF para unirlo' })}</span>
      </div>
    </div>
  );
}
