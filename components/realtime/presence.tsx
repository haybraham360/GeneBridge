'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

/**
 * "Online now" (task 15, section 2): verified professionals announce
 * themselves on a presence channel while they have GeneBridge open; the
 * directory listens. Only the professional's id is shared: they already
 * appear in the directory. Supabase drops a presence after the connection
 * goes away; the dot also needs activity in the last 5 minutes.
 */
const CHANNEL = 'professionals-online';
const ACTIVE_MS = 5 * 60_000;

export function ProfessionalPresence({ userId }: { userId: string }) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(CHANNEL, { config: { presence: { key: userId } } });
    let last = Date.now();
    const track = () => void channel.track({ active_at: new Date(last).toISOString() });
    const activity = () => {
      const now = Date.now();
      // Re-announce at most once a minute.
      if (now - last > 60_000) {
        last = now;
        track();
      }
    };
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') track();
    });
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    return () => {
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      void supabase.removeChannel(channel);
    };
  }, [userId]);
  return null;
}

/** Ids of professionals active in the last 5 minutes. */
export function useOnlineProfessionals(): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set());
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(CHANNEL);
    const read = () => {
      const state = channel.presenceState<{ active_at?: string }>();
      const now = Date.now();
      setOnline(
        new Set(
          Object.entries(state)
            .filter(([, metas]) => metas.some((m) => m.active_at && now - Date.parse(m.active_at) < ACTIVE_MS))
            .map(([id]) => id),
        ),
      );
    };
    channel.on('presence', { event: 'sync' }, read).subscribe();
    const timer = setInterval(read, 60_000);
    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);
  return online;
}
