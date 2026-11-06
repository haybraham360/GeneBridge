/** Reads the /api/family/describe event stream. Browser only. */
import type { Change, DescribeRequest, TurnSummary } from '@/lib/family/ai/schema';

export type DescribeFailure = 'rate_limited' | 'too_long' | 'signed_out' | 'invalid' | 'failed' | 'cancelled';

export async function describeTurn(
  body: DescribeRequest,
  handlers: { onChange: (c: Change) => void; signal?: AbortSignal },
): Promise<{ summary: TurnSummary } | { error: DescribeFailure }> {
  let response: Response;
  try {
    response = await fetch('/api/family/describe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: handlers.signal,
    });
  } catch {
    return { error: handlers.signal?.aborted ? 'cancelled' : 'failed' };
  }
  if (!response.ok || !response.body) {
    const b = (await response.json().catch(() => ({}))) as { code?: DescribeFailure };
    return { error: b.code ?? 'failed' };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let summary: TurnSummary | null = null;
  let error: DescribeFailure | null = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let at: number;
      while ((at = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const event = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (!event || !data) continue;
        const parsed = JSON.parse(data) as unknown;
        if (event === 'change') handlers.onChange(parsed as Change);
        else if (event === 'summary') summary = parsed as TurnSummary;
        else if (event === 'error') error = (parsed as { code: DescribeFailure }).code;
      }
    }
  } catch {
    return { error: handlers.signal?.aborted ? 'cancelled' : 'failed' };
  }
  if (error) return { error };
  return summary ? { summary } : { error: 'failed' };
}

export function sendFamilyEvent(name: string, props: Record<string, string | number> = {}) {
  void fetch('/api/family/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, props }),
    keepalive: true,
  }).catch(() => {});
}
