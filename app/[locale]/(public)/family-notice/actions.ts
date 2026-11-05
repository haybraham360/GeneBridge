'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { reportNotice, reportReasons, stopNotice, undoStopNotice, type ReportReason } from '@/lib/notices/server';
import { isNoticeCode } from '@/lib/notices/types';

/*
 * Form actions for the public notice pages. They work without JavaScript
 * (plain form posts) and take nothing but the link code from the browser.
 */

function codeFrom(form: FormData): string | null {
  const code = form.get('code');
  return isNoticeCode(code) ? code : null;
}

/** "Stop messages": suppresses the number at once, then shows the stopped state. */
export async function stopAction(form: FormData) {
  const locale = await getLocale();
  const code = codeFrom(form);
  if (code) await stopNotice(code);
  return redirect({ href: code ? `/family-notice/${code}` : '/family-notice', locale });
}

export async function undoStopAction(form: FormData) {
  const locale = await getLocale();
  const code = codeFrom(form);
  if (code) await undoStopNotice(code);
  return redirect({ href: code ? `/family-notice/${code}` : '/family-notice', locale });
}

export async function reportAction(form: FormData) {
  const locale = await getLocale();
  const code = codeFrom(form);
  const reason = form.get('reason');
  if (!code) return redirect({ href: '/family-notice', locale });
  if (!reportReasons.includes(reason as ReportReason)) {
    return redirect({ href: `/family-notice/${code}/report?missing=1`, locale });
  }
  await reportNotice(code, reason as ReportReason);
  return redirect({ href: `/family-notice/${code}/report/sent`, locale });
}
