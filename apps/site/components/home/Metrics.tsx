import { METRICS } from '@/lib/home';
import { getT } from '@/lib/locale';

/** The project in four numbers. */
export function Metrics() {
  const t = getT();
  return (
    <section aria-labelledby="metrics" className="mx-auto max-w-[1180px] px-6 pt-14">
      <h2 id="metrics" className="sr-only">
        {t({ en: 'By the numbers', es: 'En cifras' })}
      </h2>
      <dl className="reveal grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {METRICS.map(({ label, value, note }) => (
          <div key={label.en} className="flex flex-col rounded-2xl border border-border bg-white p-5">
            <dt className="order-2 mt-1.5 text-[15px] font-semibold text-ink">{t(label)}</dt>
            <dd className="order-1 m-0 text-[clamp(32px,4vw,44px)] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</dd>
            <dd className="order-3 m-0 mt-1 text-sm leading-[1.45] text-muted">{t(note)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
