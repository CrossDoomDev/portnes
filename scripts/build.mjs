import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { audit } from "./audit.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const files = await audit();
for (const file of files.filter((file) => /\.(js|mjs)$/.test(file))) {
  const result = spawnSync(
    process.execPath,
    ["--check", path.join(root, file)],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
}
await fs.rm(path.join(root, "dist"), { recursive: true, force: true });
await fs.mkdir(path.join(root, "dist"), { recursive: true });
for (const file of ["index.html", "styles.css", "src", "data", "assets"])
  await fs.cp(path.join(root, file), path.join(root, "dist", file), {
    recursive: true,
  });
console.log(
  "Built standalone native gameplay and inspection views. Full campaign verification remains incomplete.",
);
