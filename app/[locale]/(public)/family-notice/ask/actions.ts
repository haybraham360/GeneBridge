'use server';

import { getLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { publicAnswer, type PublicAnswer } from '@/lib/notices/ask';

export type AskState = { question: string; answer: PublicAnswer | null };

/** One general question, one answer. Nothing is saved. Works without JavaScript. */
export async function askAction(_prev: AskState, form: FormData): Promise<AskState> {
  const question = typeof form.get('question') === 'string' ? String(form.get('question')) : '';
  const locale = (await getLocale()) === 'ar' ? 'ar' : 'en';
  const h = await headers();
  const address = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  const answer = await publicAnswer(question, locale, address);
  return { question, answer };
}
