import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';

export function CtaBand() {
  const t = useTranslations('landing.cta');

  return (
    <section className="mx-auto mt-28 max-w-page px-6">
      <div className="reveal flex flex-wrap items-center justify-between gap-6 rounded-[32px] bg-brand p-[clamp(32px,5vw,64px)]">
        <h2 className="font-display max-w-[620px] text-[clamp(30px,4vw,48px)] leading-[1.1] font-extrabold tracking-[-0.02em] text-ink">
          {t('title')}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button href="/auth" variant="dark" size="lg">
            {t('button')}
          </Button>
          <Button href="/auth" variant="ghost" size="lg" className="border-ink/15">
            {t('guest')}
          </Button>
        </div>
      </div>
    </section>
  );
}
