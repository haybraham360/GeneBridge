import { PageSkeleton } from '@/components/ui/PageSkeleton';

/** Instant placeholder inside the counsellor workspace while a page loads. */
export default function Loading() {
  return <PageSkeleton padded={false} />;
}
