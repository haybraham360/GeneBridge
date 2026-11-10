'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useRef } from 'react';
import { mapTiles } from '@/lib/nearby/tiles';
import type { Point } from '@/lib/nearby/geo';

export type MapItem = { key: string; number: number; point: Point; label: string };

/**
 * The optional map beside the list (docs/nearby-care.md). Loaded only after
 * the person opens it, so no tile request happens before then. The list is
 * the accessible view: markers are not in the tab order, and each numbered
 * marker matches a numbered list item.
 */
export default function NearbyMap({ centre, items, onSelect, label }: { centre: Point; items: MapItem[]; onSelect: (key: string) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let map: LeafletMap | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !box.current) return;
      map = L.map(box.current, { keyboard: false, scrollWheelZoom: false, attributionControl: true }).setView([centre.lat, centre.lng], 11);
      L.tileLayer(mapTiles.url, { attribution: mapTiles.attribution, maxZoom: 18 }).addTo(map);
      // The search area: a circle about the size of the rounding, not a pin.
      L.circle([centre.lat, centre.lng], { radius: 1000, color: '#141414', weight: 2, fillOpacity: 0.08 }).addTo(map);
      const bounds = L.latLngBounds([[centre.lat, centre.lng]]);
      for (const item of items) {
        const icon = L.divIcon({
          className: '',
          html: `<span class="flex size-8 items-center justify-center rounded-full border-2 border-white bg-ink text-[13px] font-extrabold text-white shadow-card">${item.number}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        L.marker([item.point.lat, item.point.lng], { icon, keyboard: false, title: item.label })
          .on('click', () => select.current(item.key))
          .addTo(map);
        bounds.extend([item.point.lat, item.point.lng]);
      }
      if (items.length) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 });
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [centre, items]);

  // Map tiles never mirror; the page around it still follows the language.
  return <div ref={box} dir="ltr" role="region" aria-label={label} className="h-[min(60vh,520px)] w-full overflow-hidden rounded-card border border-line" data-testid="nearby-map" />;
}
