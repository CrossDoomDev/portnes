import { sha256Software } from "./sha256.js";

export const CARTRIDGE = Object.freeze({
  title: "Iron Tank: The Invasion of Normandy (USA)",
  url: "./rom/iron-tank.nes",
  size: 262160,
  sha256: "e219538626a929b5b6c570b9b2d9843afba171d3032de0bd3122f38077a71184",
  mapper: 1,
});

export function inspectCartridge(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (
    bytes.length !== CARTRIDGE.size ||
    bytes[0] !== 78 ||
    bytes[1] !== 69 ||
    bytes[2] !== 83 ||
    bytes[3] !== 26
  ) {
    throw new Error(
      "Нужен исходный файл Iron Tank (USA), размером 262 160 байт.",
    );
  }
  const mapper = (bytes[6] >> 4) | (bytes[7] & 240);
  if (mapper !== 1 || bytes[4] !== 8 || bytes[5] !== 16) {
    throw new Error(
      "Структура картриджа отличается от приложенного Iron Tank.",
    );
  }
  return {
    bytes,
    mapper,
    prgBytes: bytes[4] * 16384,
    chrBytes: bytes[5] * 8192,
  };
}

export async function validateCartridge(input) {
  const result = inspectCartridge(input);
  let hex;
  if (globalThis.crypto?.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", result.bytes);
    hex = Array.from(new Uint8Array(hash), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  } else hex = sha256Software(result.bytes);
  if (hex !== CARTRIDGE.sha256)
    throw new Error(
      "Контрольная сумма не совпадает с исходным ROM из задания.",
    );
  return result.bytes;
}
