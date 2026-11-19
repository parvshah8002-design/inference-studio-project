import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "12mb" }));

function getKey(req: express.Request) {
  // A supplied key is used for this request only; it is never persisted or logged.
  return (req.header("x-groq-api-key") || process.env.GROQ_API_KEY || "").trim();
}
function authError(res: express.Response) {
  return res.status(401).json({ error: { message: "Add a Groq API key in Settings, or configure GROQ_API_KEY on the server." } });
}

app.get("/api/health", (_req, res) => res.json({ ok: true, provider: "Groq API" }));

app.get("/api/models", async (req, res) => {
  const key = getKey(req);
  if (!key) return authError(res);
  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` }
    });
    const body = await upstream.json();
    return res.status(upstream.status).json(body);
  } catch {
    return res.status(502).json({ error: { message: "Could not reach Groq. Check your network and try again." } });
  }
});

app.post("/api/chat/completions", async (req, res) => {
  const key = getKey(req);
  if (!key) return authError(res);
  const controller = new AbortController();
  res.on("close", () => { if (!res.writableEnded) controller.abort(); });
  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: controller.signal
    });
    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type") || "application/json";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache, no-transform");
    if (!upstream.body) return res.end();
    // Stream bytes directly so the browser can render tokens as they arrive.
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) await new Promise<void>(resolve => res.once("drain", resolve));
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) res.status(502).json({ error: { message: error instanceof Error ? error.message : "Inference request failed." } });
    else res.end();
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`API proxy listening on http://localhost:${port}`));
