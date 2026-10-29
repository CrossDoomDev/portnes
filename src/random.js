/** Arithmetic from the original random routine, expressed as native game code.
 * The context bytes are REQUIRED: the original mixes call-context and actor
 * data, not just a seed. Caller-context reconstruction is not yet complete.
 */
export function originalRandom(seed, frameCountdown, contextBytes) {
  if (!Array.isArray(contextBytes) || contextBytes.length !== 8)
    throw new Error("Exactly eight original context bytes are required");
  let value = (frameCountdown * 4) & 255;
  let carry = (frameCountdown >> 6) & 1;
  for (const operand of [seed, frameCountdown, ...contextBytes]) {
    const sum = value + (operand & 255) + carry;
    value = sum & 255;
    carry = sum > 255 ? 1 : 0;
  }
  return value;
}
