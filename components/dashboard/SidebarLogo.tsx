import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import mark from '@/public/genebridge-mark.png';

type LogoProps = {
  size?: 'md' | 'sm';
  className?: string;
};

export function Logo({ size = 'md', className }: LogoProps) {
  const t = useTranslations('landing.logo');
  return (
    <Link
      href="/"
      aria-label={t('homeLabel')}
      // The lockup (mark, then wordmark) is a fixed brand asset: never mirrored.
      dir="ltr"
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-lg font-extrabold tracking-[-0.02em] no-underline',
        size === 'md' ? 'text-[26px]' : 'text-xl',
        className,
      )}
    >
      <Image
        src={mark}
        alt=""
        priority={size === 'md'}
        className={cn('w-auto', size === 'md' ? 'h-9.5' : 'h-7.25')}
      />
      <span lang="en">
        <span className="text-ink">{t('gene')}</span>
        <span className="text-brand">{t('bridge')}</span>
      </span>
    </Link>
  );
}
