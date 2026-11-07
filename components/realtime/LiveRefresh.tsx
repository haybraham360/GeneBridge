'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/browser';

type Watch = { table: 'bookings' | 'notifications' | 'conversations' | 'messages'; filter: string };

/**
 * Re-reads the page when rows the person can see change (Supabase Realtime,
 * which applies row-level security). Used so both sides of a booking see it
 * at once (task 15, section 4). Renders nothing.
 */
export function LiveRefresh({ channel, watch }: { channel: string; watch: Watch[] }) {
  const router = useRouter();
  const key = JSON.stringify(watch);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    let sub = supabase.channel(channel);
    for (const w of JSON.parse(key) as Watch[]) {
      sub = sub.on('postgres_changes', { event: '*', schema: 'public', table: w.table, filter: w.filter }, refresh);
    }
    sub.subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(sub);
    };
  }, [channel, key, router]);

  return null;
}
