/**
 * Map tiles. [MAP PROVIDER] is still to be chosen (docs/nearby-care.md, open
 * items): pick one with a no-tracking policy and set these in the
 * environment. OpenStreetMap's own tile servers are for light use only.
 */
export const mapTiles = {
  url: process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  provider: process.env.NEXT_PUBLIC_MAP_PROVIDER_NAME || 'OpenStreetMap',
};
