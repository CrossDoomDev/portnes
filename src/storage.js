const DATABASE = "portnes-iron-tank";
export const SAVE_VERSION = 1;
let connection;
function database() {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("saves");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        connection = null;
        reject(request.error);
      };
      request.onblocked = () => {
        connection = null;
        reject(
          new Error("Закройте другие вкладки игры и повторите сохранение."),
        );
      };
    });
  return connection;
}

export function validateSave(save, romHash) {
  if (
    !save ||
    save.version !== SAVE_VERSION ||
    save.romHash !== romHash ||
    !Number.isInteger(save.frame) ||
    save.frame < 0 ||
    !save.state?.cpu ||
    !save.state?.ppu ||
    !save.state?.mmap ||
    !save.state?.papu ||
    !save.state?.controllers ||
    save.state.cpu.mem?.length !== 65536 ||
    save.state.ppu.vramMem?.length !== 32768 ||
    save.state.ppu.spriteMem?.length !== 256 ||
    save.state.ppu.buffer?.length !== 61440 ||
    !Array.isArray(save.state.ppu.ptTile) ||
    save.state.ppu.ptTile.length !== 512
  ) {
    throw new Error(
      "Сохранение повреждено или относится к другой версии игры.",
    );
  }
  return save;
}

export async function putSave(save) {
  const db = await database();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("saves", "readwrite");
    transaction.objectStore("saves").put(save, "quick");
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("Сохранение прервано."));
  });
}

export async function getSave() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("saves").objectStore("saves").get("quick");
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export function readPreferences() {
  try {
    const data = JSON.parse(
      localStorage.getItem("portnes-preferences") || "{}",
    );
    return {
      muted: Boolean(data.muted),
      graphics: data.graphics === "original" ? "original" : "new",
    };
  } catch {
    return { muted: false, graphics: "new" };
  }
}
export function writePreferences(preferences) {
  try {
    localStorage.setItem("portnes-preferences", JSON.stringify(preferences));
  } catch {
    /* Gameplay works without preference storage. */
  }
}
