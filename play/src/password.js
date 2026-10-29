/** Original seven-digit checkpoint password, C568–C5A3 / FF6A–FFE5.
 * Passwords contain the route position; inventory and score are reset.
 */
export function encodePassword(page) {
  const low = page & 255, side = (page >> 8) & 1;
  const encoded = (((low ^ side) << 1) | side) & 255;
  const checksum = (low + encoded + 171) & 255;
  return `${(checksum >> 4) & 7}${(low * 256 + encoded).toString().padStart(5, "0")}${checksum & 7}`;
}
export function decodePassword(text) {
  if (!/^\d{7}$/.test(text)) return { valid: false, error: "Введите семь цифр." };
  const value = Number(text.slice(1, 6)) & 65535;
  const encoded = value & 255, low = value >> 8;
  const checksum = (encoded + low + 171) & 255;
  const valid = (encoded & 254) === (((encoded & 1) ^ low) << 1 & 255)
    && Number(text[0]) === ((checksum >> 4) & 7) && Number(text[6]) === (checksum & 7);
  return {
    valid, page: low | ((encoded & 1) << 8), counter: (encoded << 8) | low,
    ...(valid ? {} : { error: "Пароль не подходит. Проверьте цифры." }),
  };
}
