/**
 * Official public licence lookups (task 14, section 5). Where an issuing
 * authority offers a public lookup, the admin review screen links to it, and
 * it opens in a new tab. GeneBridge never scrapes or calls these sites; the
 * admin checks by hand.
 *
 * [CONFIRM SOURCE]: every URL below is unset until the programme confirms
 * the official lookup page for each authority. Fill in only an official
 * government page, then the review screen shows the link automatically.
 */
import type { Authority } from './types';

export type RegistryLookup = {
  authority: Authority;
  /** Official lookup page, or null while unconfirmed. */
  url: string | null;
  /** Shown to the admin while the URL is unconfirmed. */
  note: string;
};

const lookups: Record<Authority, RegistryLookup> = {
  doh_abu_dhabi: { authority: 'doh_abu_dhabi', url: null, note: '[CONFIRM SOURCE] Department of Health – Abu Dhabi professional lookup' },
  mohap: { authority: 'mohap', url: null, note: '[CONFIRM SOURCE] Ministry of Health and Prevention professional lookup' },
  dha: { authority: 'dha', url: null, note: '[CONFIRM SOURCE] Dubai Health Authority professional lookup' },
  other: { authority: 'other', url: null, note: 'No official lookup: check with the issuing body directly.' },
};

export function registryLookup(authority: Authority): RegistryLookup {
  return lookups[authority];
}
