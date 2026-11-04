import { IdleSignOut } from '@/components/auth/IdleSignOut';

/** Signed-in area. The proxy guards these routes; this adds the idle timer. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <IdleSignOut />
    </>
  );
}
