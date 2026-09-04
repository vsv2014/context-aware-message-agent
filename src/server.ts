import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runRecords } from "./agent.js";

const page = readFileSync(join(process.cwd(), "web", "index.html"), "utf8");
const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(page); return;
  }
  if (req.method === "GET" && req.url === "/sample.jsonl") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); res.end(readFileSync(join(process.cwd(), "sample (1).jsonl"), "utf8")); return;
  }
  if (req.method === "POST" && req.url === "/api/run") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const records = body.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
        const output = runRecords(records);
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(output));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: String(error) }));
      }
    }); return;
  }
  res.writeHead(404); res.end("Not found");
});
const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Message Agent UI: http://localhost:${port}`));
