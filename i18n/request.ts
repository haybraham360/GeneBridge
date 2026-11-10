import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const [landing, common, auth, onboarding, analytics, assistant, dashboard, pro, notice, talk, conditions, services, results, couple, scan, family, proOnboarding, verify, admin, directory, booking, chat, nearby] = await Promise.all([
    import(`../messages/${locale}/landing.json`),
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/auth.json`),
    import(`../messages/${locale}/onboarding.json`),
    import(`../messages/${locale}/analytics.json`),
    import(`../messages/${locale}/assistant.json`),
    import(`../messages/${locale}/dashboard.json`),
    import(`../messages/${locale}/pro.json`),
    import(`../messages/${locale}/notice.json`),
    import(`../messages/${locale}/talk.json`),
    import(`../messages/${locale}/conditions.json`),
    import(`../messages/${locale}/services.json`),
    import(`../messages/${locale}/results.json`),
    import(`../messages/${locale}/couple.json`),
    import(`../messages/${locale}/scan.json`),
    import(`../messages/${locale}/family.json`),
    import(`../messages/${locale}/pro-onboarding.json`),
    import(`../messages/${locale}/verify.json`),
    import(`../messages/${locale}/admin.json`),
    import(`../messages/${locale}/directory.json`),
    import(`../messages/${locale}/booking.json`),
    import(`../messages/${locale}/chat.json`),
    import(`../messages/${locale}/nearby.json`),
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
      notice: notice.default,
      talk: talk.default,
      conditions: conditions.default,
      services: services.default,
      results: results.default,
      couple: couple.default,
      scan: scan.default,
      family: family.default,
      proOnboarding: proOnboarding.default,
      verify: verify.default,
      admin: admin.default,
      directory: directory.default,
      booking: booking.default,
      chat: chat.default,
      nearby: nearby.default,
    },
  };
});
