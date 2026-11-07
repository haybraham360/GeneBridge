'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_TIME_ZONE } from '@/lib/booking/types';
import { viewerTimeZone } from '@/lib/booking/time';

/**
 * The viewer's own time zone, from their browser. The first render uses
 * Asia/Dubai (the server's default) so server and browser agree; the
 * browser's zone follows straight after.
 */
export function useViewerTimeZone(): string {
  const [zone, setZone] = useState(DEFAULT_TIME_ZONE);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after hydration
    setZone(viewerTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, []);
  return zone;
}
