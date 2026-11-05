import 'server-only';

/**
 * Sends a family notice by SMS or WhatsApp. MOCK for the demo: logs the
 * message and link to the server console. Swap in Twilio or WhatsApp
 * Business later; the message always comes from GeneBridge, never from the
 * sender's number, and is always a fixed template.
 *
 * The phone number is used here only and never stored or logged in full.
 */
export type OutgoingNotice = {
  channel: 'sms' | 'whatsapp';
  phone: string;
  text: string;
  link: string;
};

export async function sendNotice(message: OutgoingNotice): Promise<void> {
  const masked = `${message.phone.slice(0, 4)}…${message.phone.slice(-2)}`;
  console.info(`[mock ${message.channel}] to ${masked}: ${message.text}`);
}
