import 'server-only';
import type { Messages } from 'next-intl';
import { getMessages } from 'next-intl/server';

/**
 * Only the message namespaces a route group's client components use. Every
 * page otherwise ships all ~110 KB of strings to the browser in its HTML.
 * Server components read messages on the server and aren't affected.
 * When a client component in a group starts using a new namespace, add it
 * here.
 */
export async function clientMessages<K extends keyof Messages>(namespaces: readonly K[]) {
  const messages = await getMessages();
  return Object.fromEntries(namespaces.map((ns) => [ns, messages[ns]])) as Pick<Messages, K>;
}
