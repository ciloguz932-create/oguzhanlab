import express, { type Request, type Response } from "express";

import { AgentService, publicRun } from "../agent/service";
import type { ProviderId } from "../../lib/agent/types";

const PROVIDERS: ProviderId[] = ["openai", "anthropic", "openrouter", "gemini", "local"];

/**
 * Standalone HTTP Agent API. Reuses the RN-free agent core. Stateless w.r.t.
 * credentials: the API key arrives per request (Authorization: Bearer <key>, or
 * body.apiKey) and is never stored or logged. See AGENT_API.md.
 */
export function createAgentApi(service = new AgentService()): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "oguzhanlab-agent-api" }));

  app.post("/api/agent/runs", async (req: Request, res: Response) => {
    try {
      const bearer = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      const apiKey = bearer || String(req.body?.apiKey ?? "");
      const provider = req.body?.provider as ProviderId | undefined;
      if (provider && !PROVIDERS.includes(provider)) return res.status(400).json({ error: `Unknown provider: ${provider}` });
      const record = await service.createRun({
        instruction: String(req.body?.instruction ?? ""),
        apiKey,
        provider,
        model: req.body?.model ? String(req.body.model) : undefined,
        allowedTools: Array.isArray(req.body?.allowedTools) ? req.body.allowedTools.map(String) : undefined,
      });
      return res.status(201).json({ id: record.id, status: record.status, provider: record.provider });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create run." });
    }
  });

  app.get("/api/agent/runs", (_req, res) => {
    res.json({ runs: service.listRuns().map((run) => ({ id: run.id, status: run.status, instruction: run.instruction, createdAt: run.createdAt })) });
  });

  app.get("/api/agent/runs/:id", (req, res) => {
    const record = service.getRun(req.params.id);
    if (!record) return res.status(404).json({ error: "Run not found." });
    // Never expose file paths beyond name/size to the client.
    return res.json({ ...publicRun(record), artifacts: record.artifacts.map((a) => ({ name: a.name, size: a.size })) });
  });

  app.get("/api/agent/runs/:id/stream", (req, res) => {
    const record = service.getRun(req.params.id);
    if (!record) return res.status(404).json({ error: "Run not found." });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // Replay events so far, then live-stream.
    record.events.forEach((event) => send("event", event));
    if (record.status !== "running") {
      send("done", { status: record.status, result: record.result, error: record.error });
      return res.end();
    }
    const unsubscribe = service.subscribe(record.id, (message) => {
      if ("record" in message) {
        send("done", { status: message.record.status, result: message.record.result, error: message.record.error });
        res.end();
      } else {
        send("event", message);
      }
    });
    req.on("close", unsubscribe);
    return undefined;
  });

  return app;
}

// Only listen when run directly (not when imported by tests).
const isMain = process.argv[1] && (process.argv[1].endsWith("index.js") || process.argv[1].includes("agent-api"));
if (isMain) {
  const port = Number(process.env.AGENT_API_PORT ?? 8787);
  createAgentApi().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`OguzhanLab Agent API listening on :${port}`);
  });
}
