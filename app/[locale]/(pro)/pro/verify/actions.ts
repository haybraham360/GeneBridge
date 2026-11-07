'use server';

/*
 * Submitting verification (task 14, section 5). The documents are already
 * uploaded (encrypted) by /api/kyc/upload. This creates the submission as the
 * professional (RLS checks the paths are theirs and nothing is open), which
 * sets them to pending, then runs the AI pre-check with the service role and
 * stores it for the admin. The pre-check never decides anything.
 */
import { logEvents } from '@/lib/auth/events';
import { countChecks } from '@/lib/kyc/checks';
import type { KycEvent } from '@/lib/kyc/events';
import { emailStatusChange } from '@/lib/kyc/notify';
import { runPrecheck, type PrecheckImage } from '@/lib/kyc/precheck';
import { kycProvider } from '@/lib/kyc/provider';
import { requireProfessionalAction } from '@/lib/kyc/server';
import { listDraft, parseDocumentPath, readDocument, unpackDocument } from '@/lib/kyc/storage';
import { isAuthority, MAX_PAGES } from '@/lib/kyc/types';
import { createAdminClient } from '@/lib/supabase/admin';

export type SubmitInput = {
  draftId: string;
  licenceNumber: string;
  authority: string;
  authorityOther?: string;
  expiry: string;
  consent: boolean;
};

export type SubmitResult =
  | { status: 'ok' }
  | { status: 'invalid'; field: 'licenceNumber' | 'authority' | 'authorityOther' | 'expiry' | 'consent' | 'licence' | 'id' }
  | { status: 'not_allowed' }
  | { status: 'error' };

const pageOrder = (a: string, b: string) => (parseDocumentPath(a)?.page ?? 0) - (parseDocumentPath(b)?.page ?? 0);

export async function submitVerification(input: SubmitInput): Promise<SubmitResult> {
  const ctx = await requireProfessionalAction();
  const { supabase, userId, profile } = ctx;

  const licenceNumber = typeof input.licenceNumber === 'string' ? input.licenceNumber.trim() : '';
  if (licenceNumber.length < 2 || licenceNumber.length > 64) return { status: 'invalid', field: 'licenceNumber' };
  if (!isAuthority(input.authority)) return { status: 'invalid', field: 'authority' };
  const authorityOther = input.authority === 'other' ? (input.authorityOther ?? '').trim().slice(0, 120) : '';
  if (input.authority === 'other' && authorityOther.length < 2) return { status: 'invalid', field: 'authorityOther' };
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiry) || input.expiry <= today) return { status: 'invalid', field: 'expiry' };
  if (input.consent !== true) return { status: 'invalid', field: 'consent' };

  // What was actually uploaded for this draft, in the professional's folder.
  const admin = createAdminClient();
  const uploaded = typeof input.draftId === 'string' ? await listDraft(admin, userId, input.draftId) : [];
  const ofKind = (kind: 'licence' | 'id' | 'selfie') =>
    uploaded.filter((p) => parseDocumentPath(p)?.kind === kind).sort(pageOrder).slice(0, MAX_PAGES[kind]);
  const licencePaths = ofKind('licence');
  const idPaths = ofKind('id');
  const selfie = ofKind('selfie')[0] ?? null;
  if (licencePaths.length === 0) return { status: 'invalid', field: 'licence' };
  if (idPaths.length === 0) return { status: 'invalid', field: 'id' };

  const { data: created, error } = await supabase
    .from('verification_submissions')
    .insert({
      id_document_paths: idPaths,
      licence_document_paths: licencePaths,
      selfie_path: selfie,
      entered_licence_number: licenceNumber,
      entered_authority: input.authority,
      entered_authority_other: authorityOther || null,
      entered_expiry: input.expiry,
    })
    .select('id')
    .single();
  if (error || !created) {
    // RLS refuses when a submission is open or the professional can't submit now.
    console.error(`kyc submit failed: ${error?.code ?? ''}`);
    return error?.code === '42501' || error?.code === '23505' ? { status: 'not_allowed' } : { status: 'error' };
  }

  const events: KycEvent[] = [{ name: 'kyc_submitted' }];
  await emailStatusChange(admin, userId, 'pending');

  // The pre-check: assists the admin, never blocks the submission.
  const images: PrecheckImage[] = [];
  for (const [kind, paths] of [['licence', licencePaths], ['id', idPaths]] as const) {
    for (const path of paths) {
      const stored = await readDocument(admin, path);
      if (stored) images.push({ kind, ...unpackDocument(stored) });
    }
  }
  const precheck = await runPrecheck(images, { licenceNumber, expiry: input.expiry, displayName: profile.displayName });

  // Optional identity provider (ID authenticity, face match). Off by default.
  const provider = kycProvider();
  if (provider && precheck.status === 'completed') {
    try {
      const idFront = images.find((i) => i.kind === 'id')?.data;
      const idBack = images.filter((i) => i.kind === 'id')[1]?.data ?? null;
      const selfieData = selfie ? await readDocument(admin, selfie) : null;
      if (idFront) precheck.provider = await provider.verify({ idFront, idBack, selfie: selfieData ? unpackDocument(selfieData).data : null });
    } catch {
      precheck.provider = null;
    }
  }

  await admin.from('verification_submissions').update({ ai_precheck: precheck }).eq('id', created.id);
  if (precheck.status === 'completed') {
    await admin.from('verification_audit').insert({ submission_id: created.id, subject_user_id: userId, actor_id: null, action: 'precheck_completed' });
    events.push({ name: 'kyc_precheck_completed', props: countChecks(precheck.checks) });
  }
  await logEvents(supabase, userId, events);
  return { status: 'ok' };
}
