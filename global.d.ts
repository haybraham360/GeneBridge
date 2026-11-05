import type { routing } from '@/i18n/routing';
import type landing from '@/messages/en/landing.json';
import type common from '@/messages/en/common.json';
import type dashboard from '@/messages/en/dashboard.json';
import type auth from '@/messages/en/auth.json';
import type onboarding from '@/messages/en/onboarding.json';
import type analytics from '@/messages/en/analytics.json';
import type assistant from '@/messages/en/assistant.json';
import type pro from '@/messages/en/pro.json';
import type notice from '@/messages/en/notice.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: {
      landing: typeof landing;
      common: typeof common;
      dashboard: typeof dashboard;
      auth: typeof auth;
      onboarding: typeof onboarding;
      analytics: typeof analytics;
      assistant: typeof assistant;
      pro: typeof pro;
      notice: typeof notice;
    };
  }
}
