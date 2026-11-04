import { useTranslations } from 'next-intl';

// Placeholder slots only. No real company logos until a partnership exists.
const slots = ['screening', 'hospital', 'lab', 'ivf', 'authority'] as const;

export function Partners() {
  const t = useTranslations('landing.partners');

  return (
    <section className="mx-auto mt-14 max-w-[1200px] px-6 text-center">
      <h2 className="mb-5 text-xs font-extrabold tracking-[0.2em] uppercase">{t('title')}</h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {slots.map((slot) => (
          <li
            key={slot}
            className="rounded-input border-[1.5px] border-dashed border-[#DCC6B6] px-3 py-[18px] text-sm font-semibold text-[#6B625C] last:col-span-2 sm:last:col-span-1"
          >
            <bdi>{t(slot)}</bdi>
          </li>
        ))}
      </ul>
    </section>
  );
}
