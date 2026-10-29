import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
export async function audit() {
  const files = [];
  async function scan(relative) {
    for (const entry of await fs.readdir(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const name = path.posix.join(relative, entry.name);
      if (
        entry.name.startsWith(".") ||
        ["dist", "node_modules"].includes(entry.name)
      )
        continue;
      if (entry.isDirectory()) await scan(name);
      else files.push(name);
    }
  }
  await scan("");
  for (const file of files) {
    if (/\.(nes|bin|rom|wasm)$/i.test(file) || /^vendor\//.test(file))
      throw new Error(`Console payload forbidden: ${file}`);
    if (/^(src|data)\//.test(file)) {
      const content = await fs.readFile(path.join(root, file), "utf8");
      if (
        /loadROM|jsnes|cpu\.emulate|programCounter|OPCODE_TABLE|data:.*base64/i.test(
          content,
        )
      )
        throw new Error(`Console execution or embedded payload: ${file}`);
    }
  }
  console.log(`Native source audit passed (${files.length} files).`);
  return files;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await audit();
