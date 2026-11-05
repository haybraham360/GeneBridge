import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  // Hide the Next.js "N" badge Next shows in the corner during development.
  devIndicators: false,
};

export default withNextIntl(nextConfig);
