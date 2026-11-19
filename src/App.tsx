import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Bot, Braces, Check, ChevronDown, CircleHelp, Copy, Cpu, Download, Gauge,
  KeyRound, Menu, MessageSquare, Plus, RefreshCw, Save, Settings2, SlidersHorizontal,
  Sparkles, Square, Trash2, X, Zap
} from "lucide-react";

type Msg = { role: "system" | "user" | "assistant"; content: string; usage?: any; elapsed?: number };
type Model = { id: string; owned_by?: string; context_window?: number };
const starterModels = [
  { id: "openai/gpt-oss-120b", owned_by: "OpenAI" },
  { id: "openai/gpt-oss-20b", owned_by: "OpenAI" },
  { id: "llama-3.3-70b-versatile", owned_by: "Meta" },
  { id: "llama-3.1-8b-instant", owned_by: "Meta" },
  { id: "qwen/qwen3.8-27b", owned_by: "Qwen" },
  { id: "meta-models/muse-spark-open", owned_by: "Meta · Preview" }
];
const initialMessages: Msg[] = [{ role: "user", content: "Explain what makes a great developer experience in three concise points." }];
const readPrompts = () => { try { return JSON.parse(localStorage.getItem("inference-prompts") || "[]") as {name:string; system:string; prompt:string}[]; } catch { return []; } };

export default function App() {
  const [model, setModel] = useState("openai/gpt-oss-120b");
  const [models, setModels] = useState<Model[]>(starterModels);
  const [system, setSystem] = useState("You are a helpful, precise AI assistant.");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [topP, setTopP] = useState(1);
  const [presence, setPresence] = useState(0);
  const [frequency, setFrequency] = useState(0);
  const [seed, setSeed] = useState("");
  const [stopSeq, setStopSeq] = useState("");
  const [jsonMode, setJsonMode] = useState(false);
  const [reasoning, setReasoning] = useState("default");
  const [reasoningFormat, setReasoningFormat] = useState("hidden");
  const [apiKey, setApiKey] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"chat"|"code">("chat");
  const [language, setLanguage] = useState<"curl"|"javascript"|"python">("javascript");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prompts, setPrompts] = useState(readPrompts);
  const [promptName, setPromptName] = useState("Untitled prompt");
  const [showSave, setShowSave] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastUsage, setLastUsage] = useState<any>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [mobilePanel, setMobilePanel] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { localStorage.setItem("inference-prompts", JSON.stringify(prompts)); }, [prompts]);

  const headers = useMemo(() => apiKey.trim() ? { "x-groq-api-key": apiKey.trim() } : {}, [apiKey]);
  async function loadModels() {
    setError("");
    try {
      const r = await fetch("/api/models", { headers });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || `Model list failed (${r.status})`);
      if (Array.isArray(data.data) && data.data.length) {
        const available = data.data.filter((m: Model) => m.id).sort((a:Model,b:Model)=>a.id.localeCompare(b.id));
        setModels(available);
        if (!available.some((m:Model)=>m.id===model)) setModel(available[0].id);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load models."); }
  }

  function requestBody(history: Msg[]) {
    const clean = history.filter(m => m.role !== "system");
    const all = system.trim() ? [{ role: "system", content: system.trim() }, ...clean] : clean;
    const body: any = {
      model, messages: all, temperature, max_completion_tokens: maxTokens, top_p: topP,
      presence_penalty: presence, frequency_penalty: frequency, stream: true, stream_options: { include_usage: true }
    };
    if (seed !== "") body.seed = Number(seed);
    if (stopSeq.trim()) body.stop = stopSeq.split("\\n").filter(Boolean);
    if (jsonMode) body.response_format = { type: "json_object" };
    if (reasoning !== "default") body.reasoning_effort = reasoning;
    if (reasoningFormat !== "hidden" && !jsonMode) body.reasoning_format = reasoningFormat;
    return body;
  }

  async function send(text = draft, history = messages) {
    if (!text.trim() || busy) return;
    setError(""); setElapsed(null); setLastUsage(null);
    const next = [...history, { role: "user" as const, content: text.trim() }, { role: "assistant" as const, content: "" }];
    setMessages(next); setDraft(""); setBusy(true);
    const controller = new AbortController(); abortRef.current = controller;
    const started = performance.now();
    try {
      const r = await fetch("/api/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(requestBody(next)), signal: controller.signal
      });
      if (!r.ok) {
        const data = await r.json().catch(()=>({}));
        throw new Error(data?.error?.message || `Request failed (${r.status}). Check your API key and model access.`);
      }
      if (!r.body) throw new Error("Streaming is not available in this browser.");
      const reader = r.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let answer = ""; let usage: any = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          try {
            const packet = JSON.parse(raw);
            if (packet.usage) usage = packet.usage;
            const delta = packet.choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
              answer += delta;
              setMessages(prev => prev.map((m,i)=>i===prev.length-1 ? {...m,content:answer}:m));
            }
          } catch { /* Ignore partial/non-JSON event lines. */ }
        }
      }
      setElapsed(Math.round(performance.now() - started));
      setLastUsage(usage);
      setMessages(prev => prev.map((m,i)=>i===prev.length-1 ? {...m,usage,elapsed:Math.round(performance.now()-started)}:m));
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally { setBusy(false); abortRef.current = null; }
  }

  function stop() { abortRef.current?.abort(); setBusy(false); }
  function regenerate() {
    const lastUser = [...messages].reverse().findIndex(m=>m.role==="user");
    if (lastUser < 0 || busy) return;
    const userIndex = messages.length - 1 - lastUser;
    const base = messages.slice(0, userIndex);
    send(messages[userIndex].content, base);
  }
  function clearChat() { stop(); setMessages([]); setError(""); setLastUsage(null); setElapsed(null); }
  function savePrompt() {
    const name = promptName.trim() || "Untitled prompt";
    setPrompts(p => [...p.filter(x=>x.name!==name), {name, system, prompt:draft}]);
    setShowSave(false);
  }
  function applyPrompt(p: {name:string;system:string;prompt:string}) { setSystem(p.system); setDraft(p.prompt); setPromptName(p.name); }
  const code = useMemo(() => {
    const body = requestBody(messages.length ? messages : [{role:"user",content:"Your prompt here"}]);
    if (language === "curl") return `curl https://api.groq.com/openai/v1/chat/completions \\\\\\n  -H "Authorization: Bearer $GROQ_API_KEY" \\\\\\n  -H "Content-Type: application/json" \\\\\\n  -d '${JSON.stringify(body, null, 2).replaceAll("'","'\\\\''")}'`;
    if (language === "python") return `from groq import Groq\\nimport os\\n\\nclient = Groq(api_key=os.environ.get("GROQ_API_KEY"))\\n\\ncompletion = client.chat.completions.create(\\n${JSON.stringify(body, null, 2).split("\\n").map(x=>"    "+x).join("\\n")}\\n)\\n\\nprint(completion.choices[0].message.content)`;
    return `import Groq from "groq-sdk";\\n\\nconst groq = new Groq({ apiKey: process.env.GROQ_API_KEY });\\n\\nconst completion = await groq.chat.completions.create(${JSON.stringify(body,null,2)});\\n\\nconsole.log(completion.choices[0]?.message?.content);`;
  }, [language, model, messages, system, temperature, maxTokens, topP, presence, frequency, seed, stopSeq, jsonMode, reasoning, reasoningFormat]);

  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false),1200); } catch { setError("Clipboard access is unavailable."); } }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><button className="icon-btn mobile-menu" onClick={()=>setSidebarOpen(!sidebarOpen)} aria-label="Toggle navigation"><Menu size={18}/></button><div className="brand-mark"><Zap size={17} fill="currentColor"/></div><span>inference<span className="brand-muted">studio</span></span><span className="version">PLAYGROUND</span></div>
      <div className="top-actions"><span className="connection"><i/> Groq API</span><button className="btn subtle" onClick={()=>setSettingsOpen(true)}><KeyRound size={14}/> API settings</button><a className="docs-link" href="https://console.groq.com/docs" target="_blank" rel="noreferrer">Docs <span>↗</span></a></div>
    </header>
    <div className="workspace">
      <aside className={`sidebar ${sidebarOpen?"":"sidebar-hidden"}`}>
        <div className="side-section"><div className="side-label">WORKSPACE</div><button className="side-item active"><MessageSquare size={15}/> Chat playground <span className="side-dot"/></button><button className="side-item" onClick={()=>setActiveTab("code")}><Braces size={15}/> API request</button></div>
        <div className="side-section prompt-section"><div className="side-label">SAVED PROMPTS <button className="tiny-icon" onClick={()=>setShowSave(true)} title="Save current prompt"><Plus size={14}/></button></div>
          {prompts.length===0 ? <p className="empty-side">Your saved prompts will appear here.</p> : prompts.map((p,i)=><button className="prompt-item" key={i} onClick={()=>applyPrompt(p)}><span className="prompt-bullet"/> {p.name}<button className="delete-prompt" onClick={e=>{e.stopPropagation();setPrompts(xs=>xs.filter(x=>x!==p));}}><X size={12}/></button></button>)}
        </div>
        <div className="sidebar-bottom"><div className="tip-card"><Sparkles size={15}/><div><b>Fast inference</b><p>Experiment with open models powered by Groq.</p></div></div><div className="user-row"><div className="avatar">D</div><div><b>Developer workspace</b><small>Local session</small></div><button className="tiny-icon" onClick={()=>setSettingsOpen(true)}><Settings2 size={15}/></button></div></div>
      </aside>

      <main className="main">
        <div className="page-heading"><div><div className="eyebrow">PLAYGROUND <span>/</span> CHAT COMPLETIONS</div><h1>Chat playground</h1><p>Experiment with models, prompts, and inference parameters.</p></div><div className="heading-actions"><button className="btn subtle" onClick={()=>setShowSave(true)}><Save size={14}/> Save prompt</button><button className="btn subtle" onClick={clearChat}><Trash2 size={14}/> Clear</button></div></div>
        <div className="model-bar">
          <div className="model-select-wrap"><Cpu size={16}/><select value={model} onChange={e=>setModel(e.target.value)} aria-label="Select model">{models.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select><ChevronDown size={14}/></div>
          <span className="model-tag">{model.includes("120b")?"HIGH CAPABILITY":model.includes("instant")?"LOW LATENCY":model.includes("qwen")?"VISION · REASONING":"CHAT COMPLETIONS"}</span>
          <button className="refresh-models" onClick={loadModels}><RefreshCw size={13}/> Refresh models</button>
          <div className="bar-spacer"/>
          <button className="tab-btn" onClick={()=>setActiveTab("chat")} data-active={activeTab==="chat"}><MessageSquare size={14}/> Chat</button>
          <button className="tab-btn" onClick={()=>setActiveTab("code")} data-active={activeTab==="code"}><Braces size={14}/> Code</button>
          <button className="icon-btn mobile-settings" onClick={()=>setMobilePanel(!mobilePanel)}><SlidersHorizontal size={16}/></button>
        </div>
        <div className={`content-grid ${mobilePanel?"show-mobile-panel":""}`}>
          <section className="chat-column">
            {activeTab==="chat" ? <>
              <div className="system-card"><div className="card-head"><div className="card-title"><span className="role-icon"><Bot size={14}/></span><b>System instructions</b><span className="optional">OPTIONAL</span></div><button className="tiny-icon" title="Reset system prompt" onClick={()=>setSystem("")}><RefreshCw size={13}/></button></div><textarea className="system-input" value={system} onChange={e=>setSystem(e.target.value)} placeholder="Define the behavior and role of the assistant..." rows={2}/></div>
              <div className="conversation-head"><div className="card-title"><b>Messages</b><span className="message-count">{messages.length} messages</span></div><button className="tiny-icon" title="Clear conversation" onClick={clearChat}><Trash2 size={14}/></button></div>
              <div className="messages">
                {messages.length===0 && <div className="welcome"><div className="welcome-icon"><Sparkles size={21}/></div><h2>Start a conversation</h2><p>Send a message to test the selected model.</p><button className="suggestion" onClick={()=>setDraft("Write a Python function to check whether a string is a palindrome.")}>Write a Python function <span>→</span></button><button className="suggestion" onClick={()=>setDraft("Explain the difference between REST and GraphQL APIs.")}>Explain a technical concept <span>→</span></button></div>}
                {messages.map((m,i)=><div className={`message ${m.role}`} key={i}><div className="message-avatar">{m.role==="user"?"YOU":m.role==="assistant"?<Bot size={15}/>:"SYS"}</div><div className="message-body"><div className="message-meta"><b>{m.role==="user"?"You":m.role==="assistant"?"Assistant":"System"}</b>{m.role==="assistant"&&m.content&&<button className="tiny-icon" onClick={()=>copy(m.content)} title="Copy response"><Copy size={13}/></button>}</div><div className="message-text">{m.content || (busy && i===messages.length-1 ? <span className="typing"><i/><i/><i/></span> : "")}</div>{m.role==="assistant"&&m.content&&<div className="message-foot">{m.elapsed ? `${(m.elapsed/1000).toFixed(2)}s` : ""}{m.usage?.completion_tokens ? ` · ${m.usage.completion_tokens} completion tokens` : ""}{m.usage?.prompt_tokens ? ` · ${m.usage.prompt_tokens} prompt tokens` : ""}</div>}</div></div>)}
                <div ref={bottomRef}/>
              </div>
              {error&&<div className="error-banner"><CircleHelp size={15}/><span>{error}</span><button onClick={()=>setError("")}><X size={14}/></button></div>}
              <div className="composer"><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Send a message... (Shift + Enter for new line)" rows={3}/><div className="composer-bottom"><span>↵ to send <span className="muted">·</span> Shift + ↵ for new line</span><div>{busy?<button className="btn stop-btn" onClick={stop}><Square size={13} fill="currentColor"/> Stop</button>:<button className="btn primary" onClick={()=>send()} disabled={!draft.trim()}><Zap size={14}/> Run prompt</button>}</div></div></div>
              {messages.some(m=>m.role==="assistant"&&m.content)&&<div className="under-chat"><span>{lastUsage?.total_tokens ? `${lastUsage.total_tokens} total tokens` : "Ready"}</span><button onClick={regenerate} disabled={busy}><RefreshCw size={12}/> Regenerate response</button></div>}
            </> : <div className="code-panel"><div className="code-panel-head"><div><b>API request</b><p>Generated from your current playground configuration.</p></div><button className="btn subtle" onClick={()=>copy(code)}>{copied?<Check size={14}/>:<Copy size={14}/>} {copied?"Copied":"Copy code"}</button></div><div className="language-tabs">{(["curl","javascript","python"] as const).map(l=><button key={l} data-active={language===l} onClick={()=>setLanguage(l)}>{l==="curl"?"cURL":l==="javascript"?"JavaScript":"Python"}</button>)}</div><pre className="code-block"><code>{code}</code></pre><div className="code-note"><KeyRound size={14}/> Set <code>GROQ_API_KEY</code> as an environment variable. Never hard-code secrets in source control.</div></div>}
            </section>
            <aside className="settings-panel">
              <div className="settings-heading"><div><SlidersHorizontal size={16}/><b>Parameters</b></div><button className="tiny-icon" title="Reset parameters" onClick={()=>{setTemperature(.7);setMaxTokens(1024);setTopP(1);setPresence(0);setFrequency(0);setSeed("");setStopSeq("");setJsonMode(false);setReasoning("default");setReasoningFormat("hidden");}}><RefreshCw size={13}/></button></div>
              <div className="param-block"><div className="param-label"><label>Temperature</label><output>{temperature.toFixed(1)}</output></div><input type="range" min="0" max="2" step=".1" value={temperature} onChange={e=>setTemperature(+e.target.value)}/><div className="range-hints"><span>Precise</span><span>Creative</span></div></div>
              <div className="param-block"><div className="param-label"><label>Maximum completion tokens</label><output>{maxTokens.toLocaleString()}</output></div><input type="range" min="128" max="8192" step="128" value={maxTokens} onChange={e=>setMaxTokens(+e.target.value)}/><div className="range-hints"><span>128</span><span>8,192</span></div></div>
              <div className="param-block"><div className="param-label"><label>Top P</label><output>{topP.toFixed(2)}</output></div><input type="range" min="0" max="1" step=".05" value={topP} onChange={e=>setTopP(+e.target.value)}/></div>
              <div className="param-block"><div className="param-label"><label>Presence penalty</label><output>{presence.toFixed(1)}</output></div><input type="range" min="-2" max="2" step=".1" value={presence} onChange={e=>setPresence(+e.target.value)}/></div>
              <div className="param-block"><div className="param-label"><label>Frequency penalty</label><output>{frequency.toFixed(1)}</output></div><input type="range" min="-2" max="2" step=".1" value={frequency} onChange={e=>setFrequency(+e.target.value)}/></div>
              <div className="param-block compact"><label>Seed <span className="muted">· Optional</span></label><input className="text-control" type="number" value={seed} onChange={e=>setSeed(e.target.value)} placeholder="Random"/></div>
              <div className="param-block compact"><label>Stop sequences <span className="muted">· Optional</span></label><input className="text-control" value={stopSeq} onChange={e=>setStopSeq(e.target.value)} placeholder="Separate with new lines"/></div>
              <div className="advanced-divider"><span>ADVANCED</span></div>
              <label className="toggle-row"><span><b>JSON mode</b><small>Return a valid JSON object</small></span><input type="checkbox" checked={jsonMode} onChange={e=>setJsonMode(e.target.checked)}/></label>
              <div className="param-block compact"><label>Reasoning effort</label><select className="text-control" value={reasoning} onChange={e=>setReasoning(e.target.value)}><option value="default">Model default</option><option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">Extra high</option></select></div>
              <div className="param-block compact"><label>Reasoning format</label><select className="text-control" value={reasoningFormat} onChange={e=>setReasoningFormat(e.target.value)}><option value="hidden">Hidden</option><option value="parsed">Parsed</option><option value="raw">Raw</option></select><small className="field-hint">Some parameters are only supported by specific models. Unsupported combinations are reported by the API.</small></div>
              <div className="panel-footer"><Activity size={13}/> Parameters are sent with each request.</div>
            </aside>
          </div>
      </main>
    </div>
    {settingsOpen&&<div className="modal-backdrop" onClick={()=>setSettingsOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><KeyRound size={17}/><b>API configuration</b></div><button className="tiny-icon" onClick={()=>setSettingsOpen(false)}><X size={17}/></button></div><p className="modal-copy">Connect your Groq account to load available models and run real inference. Your key stays in this browser tab's memory and is sent only to this app's backend for API requests.</p><label className="modal-label">Groq API key</label><div className="key-input"><input type={keyVisible?"text":"password"} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="gsk_..."/><button onClick={()=>setKeyVisible(!keyVisible)}>{keyVisible?"Hide":"Show"}</button></div><div className="modal-actions"><a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Get an API key ↗</a><div><button className="btn subtle" onClick={()=>{setApiKey("");setError("");}}>Clear key</button><button className="btn primary" onClick={()=>{setSettingsOpen(false);loadModels();}}>Save & load models</button></div></div><div className="security-note"><Check size={14}/> Key is not saved to localStorage or written to server logs.</div></div></div>}
    {showSave&&<div className="modal-backdrop" onClick={()=>setShowSave(false)}><div className="modal save-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><Save size={17}/><b>Save prompt</b></div><button className="tiny-icon" onClick={()=>setShowSave(false)}><X size={17}/></button></div><p className="modal-copy">Save your system instructions and current draft for quick reuse.</p><label className="modal-label">Prompt name</label><input className="text-control" value={promptName} onChange={e=>setPromptName(e.target.value)} autoFocus/><div className="modal-actions end"><button className="btn subtle" onClick={()=>setShowSave(false)}>Cancel</button><button className="btn primary" onClick={savePrompt}><Save size={14}/> Save prompt</button></div></div></div>}
  </div>;
}
