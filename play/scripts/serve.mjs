import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const argumentsList = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : fallback;
};
const port = Number(option("--port", process.env.PORT || "4173"));
const host = option("--host", "0.0.0.0");
const root = path.resolve(project, option("--directory", "."));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = http.createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405);
    response.end();
    return;
  }
  try {
    const url = new URL(request.url, "http://localhost");
    const requested = decodeURIComponent(url.pathname);
    let filename = path.resolve(root, "." + requested);
    if (!filename.startsWith(root + path.sep) && filename !== root) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (requested.split("/").some((segment) => segment.startsWith("."))) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (fs.existsSync(filename) && fs.statSync(filename).isDirectory())
      filename = path.join(filename, "index.html");
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type":
        types[path.extname(filename)] || "application/octet-stream",
      "Content-Length": fs.statSync(filename).size,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
    });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(filename).pipe(response);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
  }
});
server.listen(port, host, () => {
  console.log(`Native game ready at http://localhost:${server.address().port}`);
});
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
