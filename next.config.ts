import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  // Hide the Next.js "N" badge Next shows in the corner during development.
  devIndicators: false,
  // Let a phone on the same Wi-Fi open the dev server by the Mac's LAN IP.
  // Without this, Next blocks its own scripts for non-localhost origins, so
  // pages render but nothing on them (e.g. Ask GeneBridge) responds.
  // Development only; has no effect on production builds.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*', '*.local'],
};

export default withNextIntl(nextConfig);
