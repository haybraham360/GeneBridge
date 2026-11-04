import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const [landing, common] = await Promise.all([
    import(`../messages/${locale}/landing.json`),
    import(`../messages/${locale}/common.json`),
  ]);

  return {
    locale,
    messages: { landing: landing.default, common: common.default },
  };
});
