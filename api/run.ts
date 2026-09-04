import type { IncomingMessage, ServerResponse } from "node:http";
import { runRecords } from "../src/agent.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") { res.statusCode = 405; res.end(JSON.stringify({ error: "Method not allowed" })); return; }
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
    if (body.length > 1_000_000) { res.statusCode = 413; res.end(JSON.stringify({ error: "Request too large" })); return; }
  }
  try {
    const records = body.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid JSON on line ${index + 1}: ${String(error)}`); }
    });
    res.setHeader("content-type", "application/json"); res.statusCode = 200; res.end(JSON.stringify(runRecords(records)));
  } catch (error) {
    res.setHeader("content-type", "application/json"); res.statusCode = 400; res.end(JSON.stringify({ error: String(error) }));
  }
}
