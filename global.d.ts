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
import type talk from '@/messages/en/talk.json';
import type conditions from '@/messages/en/conditions.json';
import type services from '@/messages/en/services.json';
import type results from '@/messages/en/results.json';
import type couple from '@/messages/en/couple.json';
import type scan from '@/messages/en/scan.json';
import type family from '@/messages/en/family.json';
import type proOnboarding from '@/messages/en/pro-onboarding.json';
import type verify from '@/messages/en/verify.json';
import type admin from '@/messages/en/admin.json';
import type directory from '@/messages/en/directory.json';
import type booking from '@/messages/en/booking.json';
import type chat from '@/messages/en/chat.json';
import type nearby from '@/messages/en/nearby.json';

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
      talk: typeof talk;
      conditions: typeof conditions;
      services: typeof services;
      results: typeof results;
      couple: typeof couple;
      scan: typeof scan;
      family: typeof family;
      proOnboarding: typeof proOnboarding;
      verify: typeof verify;
      admin: typeof admin;
      directory: typeof directory;
      booking: typeof booking;
      chat: typeof chat;
      nearby: typeof nearby;
    };
  }
}
