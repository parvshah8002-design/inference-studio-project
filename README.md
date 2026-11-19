# Inference Studio — Groq Playground Alternative

A responsive developer playground with live Groq chat completions, model discovery, streaming output, prompt presets, parameter controls, and generated cURL / JavaScript / Python examples.

## Requirements
- Node.js 20+
- A Groq API key from https://console.groq.com/keys

## Run locally
```bash
npm install
cp .env.example .env
# Optional: add GROQ_API_KEY to .env (server-side only)
npm run dev
```
Open http://localhost:5173. You can either set `GROQ_API_KEY` in the server `.env` or paste a key into **API settings**. A pasted key is kept in page memory only and is sent to the local backend over the same-origin `/api` route. It is not saved in localStorage.

## Production build
```bash
npm run build
```
The included development server is an API proxy. Deploy the frontend and API server behind HTTPS, restrict CORS to your own origin, add rate limiting and authentication before exposing it publicly, and provide `GROQ_API_KEY` as a server secret if using a shared key.

## Implemented
- Live model list via Groq's `/models` endpoint
- Streaming chat completions, stop, regenerate, clear, copy
- System prompt and conversation history
- Temperature, max completion tokens, top-p, presence/frequency penalties, seed, stop sequences
- JSON mode and reasoning parameters (availability depends on model)
- Save/reuse/delete prompt presets in local browser storage
- Generated cURL, JavaScript SDK, and Python SDK request examples
- Token usage and request duration when returned by the API
- Responsive dark interface and API error reporting

## Notes
- Groq model IDs and supported parameters change. The model list is fetched live; parameter compatibility is ultimately validated by Groq.
- This starter focuses on text chat completions. Vision, audio, tool execution, authentication/accounts, and team prompt sharing are not implemented in this version.
- For a public multi-user deployment, do not use a shared server key without user authentication, quotas, abuse prevention, and per-user authorization.
