import type { routing } from '@/i18n/routing';
import type landing from '@/messages/en/landing.json';
import type common from '@/messages/en/common.json';
import type auth from '@/messages/en/auth.json';
import type onboarding from '@/messages/en/onboarding.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: {
      landing: typeof landing;
      common: typeof common;
      auth: typeof auth;
      onboarding: typeof onboarding;
    };
  }
}
