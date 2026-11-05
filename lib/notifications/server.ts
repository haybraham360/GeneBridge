import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReferralStatus, ReferralStep, Resource } from '@/lib/pro/types';

/** A patient's in-app notification (task 07), as returned by my_notifications(). */
export type PatientNotification = {
  id: string;
  kind: 'access_request' | 'referral_created' | 'referral_updated';
  counsellorName: string | null;
  resource: Resource | null;
  accessRequestId: string | null;
  accessStatus: 'pending' | 'granted' | 'declined' | null;
  step: ReferralStep | null;
  referralStatus: ReferralStatus | null;
  serviceName: string | null;
  createdAt: string;
  readAt: string | null;
};

/** Unread notifications, plus access requests still waiting for an answer. */
export async function loadNotifications(supabase: SupabaseClient): Promise<PatientNotification[]> {
  const { data, error } = await supabase.rpc('my_notifications');
  if (error || !data) return [];
  type Row = {
    id: string;
    kind: PatientNotification['kind'];
    counsellor_name: string | null;
    resource: Resource | null;
    access_request_id: string | null;
    access_status: PatientNotification['accessStatus'];
    step: ReferralStep | null;
    referral_status: ReferralStatus | null;
    service_name: string | null;
    created_at: string;
    read_at: string | null;
  };
  return (data as Row[])
    .filter((n) => !n.read_at || (n.kind === 'access_request' && n.access_status === 'pending'))
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      counsellorName: n.counsellor_name,
      resource: n.resource,
      accessRequestId: n.access_request_id,
      accessStatus: n.access_status,
      step: n.step,
      referralStatus: n.referral_status,
      serviceName: n.service_name,
      createdAt: n.created_at,
      readAt: n.read_at,
    }));
}
