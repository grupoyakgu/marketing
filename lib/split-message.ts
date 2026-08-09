/** Splits by Unicode code point (Array.from), not raw index — a raw slice()
 * cut can land inside a surrogate pair, leaving a chunk with a dangling lone
 * surrogate that breaks JSON encoding downstream (see PR #97). Shared by
 * every cron processor that posts a bot's reply back to Telegram in chunks. */
export function splitMessage(text: string, maxLen: number): string[] {
  const codePoints = Array.from(text);
  if (codePoints.length <= maxLen) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < codePoints.length; i += maxLen) {
    chunks.push(codePoints.slice(i, i + maxLen).join(''));
  }
  return chunks;
}
