import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'dark' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'group inline-flex items-center justify-center gap-2 rounded-full font-bold no-underline cursor-pointer select-none transition-[background-color,translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-card active:translate-y-0';

/** Arrow icons inside a Button nudge forward on hover (mirrored in RTL). */
export const buttonArrowClasses =
  'size-5 transition-transform duration-200 rtl:-scale-x-100 group-hover:translate-x-1 rtl:group-hover:-translate-x-1';

const variants: Record<ButtonVariant, string> = {
  // Orange always carries dark ink text: white on #FF5A1F fails contrast.
  primary: 'bg-brand text-ink hover:bg-brand-hover',
  dark: 'bg-ink text-white hover:bg-[#2E2A27]',
  ghost: 'bg-surface text-ink border border-line-strong hover:bg-brand-tint-soft',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-6 text-sm',
  md: 'min-h-12 px-6 text-[15px]',
  lg: 'min-h-14 px-8 text-base',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cn(base, variants[variant], sizes[size], className);
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

type LinkButtonProps = CommonProps & Omit<ComponentProps<typeof Link>, 'className' | 'children'>;
type NativeButtonProps = CommonProps &
  Omit<ComponentProps<'button'>, 'className' | 'children'> & { href?: undefined };

/** Renders a locale-aware link when `href` is given, otherwise a native button. */
export function Button(props: LinkButtonProps | NativeButtonProps) {
  if (props.href !== undefined) {
    const { variant, size, className, children, ...rest } = props as LinkButtonProps;
    return (
      <Link className={buttonClasses(variant, size, className)} {...rest}>
        {children}
      </Link>
    );
  }
  const { variant, size, className, children, type = 'button', ...rest } =
    props as NativeButtonProps;
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}
