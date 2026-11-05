import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const [landing, common, auth, onboarding, analytics, assistant, dashboard, pro] = await Promise.all([
    import(`../messages/${locale}/landing.json`),
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/auth.json`),
    import(`../messages/${locale}/onboarding.json`),
    import(`../messages/${locale}/analytics.json`),
    import(`../messages/${locale}/assistant.json`),
    import(`../messages/${locale}/dashboard.json`),
    import(`../messages/${locale}/pro.json`),
  ]);

  return {
    locale,
    messages: {
      landing: landing.default,
      common: common.default,
      auth: auth.default,
      onboarding: onboarding.default,
      analytics: analytics.default,
      assistant: assistant.default,
      dashboard: dashboard.default,
      pro: pro.default,
    },
  };
});
