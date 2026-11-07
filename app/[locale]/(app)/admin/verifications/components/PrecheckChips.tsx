import { CircleAlert, CircleCheck, CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { checkKeys, type CheckResult } from '@/lib/kyc/types';

const styles: Record<CheckResult, { className: string; icon: typeof CircleCheck }> = {
  passed: { className: 'border-success-tint bg-success-tint text-success-text', icon: CircleCheck },
  failed: { className: 'border-affected/30 bg-affected-tint text-affected', icon: CircleAlert },
  unclear: { className: 'border-line bg-surface text-ink-soft', icon: CircleHelp },
};

/** Pre-check results as chips, always with a text label, never colour alone. */
export function PrecheckChips({ checks }: { checks: Partial<Record<string, CheckResult>> }) {
  const t = useTranslations('admin.precheck');
  return (
    <ul className="flex flex-wrap gap-2">
      {checkKeys.map((key) => {
        const result = checks[key] ?? 'unclear';
        const { className, icon: Icon } = styles[result];
        return (
          <li key={key} data-check={key} data-result={result} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold', className)}>
            <Icon aria-hidden="true" className="size-4" />
            {t(`checks.${key}`)}: {t(`results.${result}`)}
          </li>
        );
      })}
    </ul>
  );
}
