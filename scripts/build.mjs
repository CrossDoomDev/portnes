import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CARTRIDGE } from "../src/cartridge.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = ["index.html", "styles.css", "src", "vendor", "assets", "rom"];
async function filesAt(relative) {
  const entry = await fs.stat(path.join(root, relative));
  if (entry.isFile()) return [relative];
  const children = await fs.readdir(path.join(root, relative));
  return (
    await Promise.all(children.map((name) => filesAt(`${relative}/${name}`)))
  ).flat();
}
const files = (await Promise.all(runtime.map(filesAt))).flat().sort();
for (const filename of files.filter((name) => name.endsWith(".js"))) {
  const result = spawnSync(
    process.execPath,
    ["--check", path.join(root, filename)],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`${filename}: ${result.stderr}`);
}
const rom = await fs.readFile(path.join(root, "rom/iron-tank.nes"));
if (createHash("sha256").update(rom).digest("hex") !== CARTRIDGE.sha256)
  throw new Error("Original cartridge checksum changed");
const hash = createHash("sha256");
for (const filename of files) {
  hash.update(filename);
  hash.update(await fs.readFile(path.join(root, filename)));
}
const version = hash.digest("hex").slice(0, 16);
const manifest =
  JSON.stringify(
    { version, assets: files.map((file) => `./${file}`) },
    null,
    2,
  ) + "\n";
const template = await fs.readFile(
  new URL("./service-worker.js.template", import.meta.url),
  "utf8",
);
const worker = template.replace("__VERSION__", version);
await fs.writeFile(path.join(root, "asset-manifest.json"), manifest);
await fs.writeFile(path.join(root, "sw.js"), worker);
const output = path.join(root, "dist");
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const entry of [...runtime, "asset-manifest.json", "sw.js"])
  await fs.cp(path.join(root, entry), path.join(output, entry), {
    recursive: true,
  });
console.log(
  `Built ${files.length} local assets. Version ${version}. Output: dist/`,
);
