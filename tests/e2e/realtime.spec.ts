/**
 * Real time, both sides (task 15, section 9), with two browser contexts:
 * a patient and a verified professional, both throwaway accounts.
 *
 *   1. The patient messages the professional; it appears on the
 *      professional's side within 2 seconds, and the reply comes back.
 *   2. A booking made by the patient appears in the professional's
 *      Sessions page at once.
 *   3. The professional confirms, and the patient's Home updates with
 *      "Join video call" (the session is moved to start in 5 minutes and a
 *      link added, as the Google Meet step would).
 *
 * Needs the task 15 migrations, Realtime enabled for the project, and
 * NEXT_PUBLIC_DEMO_MODE is not needed (sign-in uses magic links).
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { adminClient, createProfessional, deleteTestUser, findUserId, hasSupabase } from '../supabase';

test.skip(!hasSupabase, 'Supabase env vars are not set (see README.md)');

const run = Date.now();
const patientEmail = `rt-patient-${run}@example.test`;
const proEmail = `rt-pro-${run}@test.genebridge.invalid`;
let patientId: string;
let proId: string;

test.beforeAll(async () => {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email: patientEmail, email_confirm: true, user_metadata: { display_name: 'Noor', locale: 'en' } });
  if (error) throw error;
  patientId = data.user.id;
  await admin.from('profiles').update({ display_name: 'Noor', locale: 'en', onboarding_step: 8 }).eq('user_id', patientId);
  await admin.from('consents').insert({ user_id: patientId, kind: 'terms' });
  proId = await createProfessional(proEmail, { status: 'verified', accepting: true, displayName: 'Dr. Realtime Test' });
  await admin.from('professional_profiles').update({ languages: ['en'] }).eq('user_id', proId);
  await admin
    .from('availability_rules')
    .insert([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ user_id: proId, weekday, start_time: '00:00', end_time: '23:30', session_minutes: 30, format: 'video' })));
});

test.afterAll(async () => {
  if (patientId) await adminClient().auth.admin.deleteUser(patientId);
  const id = proId ?? (await findUserId({ email: proEmail }));
  if (id) await deleteTestUser(id);
});

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  await page.goto(`/en/auth/callback?${new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink' })}`);
  return page;
}

test('patient and professional message each other in real time', async ({ browser }) => {
  test.setTimeout(180_000);
  const patient = await signedIn(browser, patientEmail);
  const pro = await signedIn(browser, proEmail);

  await patient.goto(`/en/dashboard/messages?with=${proId}`);
  await expect(patient).toHaveURL(/\/en\/dashboard\/messages\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(patient.getByTestId('privacy-line')).toHaveText("Dr. Realtime Test can't see your results unless you share them.");
  const conversationId = patient.url().split('/').pop()!;

  await pro.goto(`/en/pro/messages/${conversationId}`);
  await expect(pro.getByTestId('chat-view')).toBeVisible();
  // Let both Realtime subscriptions settle.
  await pro.waitForTimeout(1500);

  await patient.getByTestId('message-input').fill('Hello from the patient');
  await patient.getByTestId('send-message').click();
  // Focus stays in the message box after sending.
  await expect(patient.getByTestId('message-input')).toBeFocused();
  await expect(pro.getByTestId('message-theirs').filter({ hasText: 'Hello from the patient' })).toBeVisible({ timeout: 2000 });

  await pro.getByTestId('message-input').fill('Hello from the professional');
  await pro.getByTestId('send-message').click();
  await expect(patient.getByTestId('message-theirs').filter({ hasText: 'Hello from the professional' })).toBeVisible({ timeout: 2000 });
  // The patient's side marks it read: "Seen" on the professional's side.
  await expect(pro.getByTestId('receipt')).toHaveText('Seen', { timeout: 5000 });
});

test('a booking appears for the professional, and confirming updates the patient\'s Home', async ({ browser }) => {
  test.setTimeout(240_000);
  const patient = await signedIn(browser, patientEmail);
  const pro = await signedIn(browser, proEmail);

  await pro.goto('/en/pro/sessions');
  await expect(pro.getByRole('heading', { name: 'Waiting for your response' })).toBeVisible();

  await patient.goto(`/en/dashboard/counsellor?with=${proId}`);
  const panel = patient.getByTestId('booking-panel');
  await expect(panel.getByRole('heading', { name: 'Book with Dr. Realtime Test' })).toBeVisible();
  await panel.getByTestId('slot-times').getByRole('radio').first().click();
  await panel.getByTestId('confirm-booking').click();
  await expect(panel.getByTestId('booking-status')).toContainText('Request sent to Dr. Realtime Test');

  // Live on the professional's side, without reloading.
  const request = pro.getByTestId('waiting-bookings').getByTestId('pro-booking').filter({ hasText: 'Noor' });
  await expect(request).toBeVisible({ timeout: 10_000 });
  await request.getByTestId('confirm-request').click();

  // As the Meet step would: a link, and the session starting in 5 minutes.
  const admin = adminClient();
  // Wait for the confirmation to be saved (the card leaves "Waiting").
  await expect(request).toHaveCount(0, { timeout: 15_000 });
  let booking: { id: string } | null = null;
  await expect
    .poll(async () => {
      ({ data: booking } = await admin.from('bookings').select('id').eq('patient_id', patientId).eq('status', 'confirmed').maybeSingle());
      return booking?.id ?? null;
    }, { timeout: 15_000 })
    .not.toBeNull();
  const start = new Date(Date.now() + 5 * 60_000);
  await admin
    .from('bookings')
    .update({ starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 30 * 60_000).toISOString(), meeting_url: 'https://meet.google.com/abc-defg-hij', meet_link_status: 'manual' })
    .eq('id', booking!.id);

  await patient.goto('/en/dashboard');
  const next = patient.getByTestId('next-session');
  await expect(next).toHaveAttribute('data-status', 'confirmed', { timeout: 10_000 });
  await expect(next.getByTestId('join-call')).toBeVisible();
});
