import { Info } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { CatalogueCondition } from '@/lib/conditions/search';
import type { UserPathInfo } from '@/lib/user/path';

/**
 * "This isn't a diagnosis" (guardrail 14), on Home for anyone without a
 * result. Names the condition they follow and why, never a status.
 */
export async function NotDiagnosisBanner({ path, catalogue }: { path: UserPathInfo; catalogue: CatalogueCondition[] }) {
  const t = await getTranslations('dashboard.explore');
  const focus = path.focus;
  const condition = focus ? catalogue.find((c) => c.id === focus.conditionId) : undefined;
  const bold = (chunks: React.ReactNode) => <strong className="font-extrabold">{chunks}</strong>;

  return (
    <p
      data-testid="not-diagnosis-banner"
      className="flex items-start gap-3 rounded-card bg-brand-tint-soft px-5 py-4 text-[15px] leading-[1.6]"
    >
      <Info aria-hidden="true" className="mt-0.5 size-5 flex-none text-brand-text" strokeWidth={2} />
      <span>
        {condition && focus
          ? t.rich('banner', { condition: condition.title, reason: t(`reasons.${focus.reason}`), b: bold })
          : t.rich('bannerNone', { b: bold })}
      </span>
    </p>
  );
}
