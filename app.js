"use strict";
/* NUBI AI — chat, imágenes y webs sin API key.
   Texto: nube gratuita (Pollinations) o IA local en el navegador (WebLLM + WebGPU).
   Imágenes: Pollinations (sin clave) o dibujo SVG hecho por la propia IA.        */

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const CLOUD_URL = "https://text.pollinations.ai/openai";
const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm";
const MODES = {
  cloud: { note: "Nube · sin API key" },
  fast: { note: "Local · ligero", base: "0.5B" },
  smart: { note: "Local · avanzado", base: "1.5B" }
};
let mode = MODES[store.get("nubi-mode", "cloud")] ? store.get("nubi-mode", "cloud") : "cloud";
let wikiEnabled = store.get("nubi-wiki", true);
let stopRequested = false, currentAbort = null, busy = false;

/* ---------- utilidades de interfaz ---------- */
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  $("toasts").appendChild(t);
  setTimeout(() => t.classList.add("out"), 3600);
  setTimeout(() => t.remove(), 4200);
}
function showLoad(pct, text) {
  $("loadBar").hidden = false;
  $("loadFill").style.width = Math.max(3, pct) + "%";
  $("loadText").textContent = "Descargando IA local (solo la primera vez) " + pct + "% " + (text ? "· " + String(text).slice(0, 70) : "");
}
function hideLoad() { $("loadBar").hidden = true; }
function updateStatus() {
  $("statusText").textContent = MODES[mode].note;
  $("statusDot").style.background = mode === "cloud" ? "#69d7a4" : "#e9bd72";
  $("modelSelect").value = mode;
  $("disclaimer").textContent = mode === "cloud"
    ? "Modo nube: tus mensajes se envían al servicio gratuito Pollinations. NUBI puede equivocarse: verifica lo importante."
    : "Modo local: la IA se ejecuta en tu dispositivo. Es más privada pero menos potente y puede equivocarse.";
}

/* ---------- Markdown seguro ---------- */
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function inline(s) {
  return s.split(/(`[^`\n]+`)/g).map((part, i) => i % 2 ? "<code>" + part.slice(1, -1) + "</code>" :
    part.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
  ).join("");
}
function codeBlock(b) {
  const lang = (b.lang || "").toLowerCase();
  const isHtml = lang === "html" || /^\s*<!doctype html|^\s*<html/i.test(b.code);
  return '<div class="code"><div class="code-head"><span>' + esc(lang || "código") + '</span><span class="code-actions"><button type="button" data-act="copy">Copiar</button>' +
    (isHtml ? '<button type="button" data-act="open-web">▶ Abrir en Webs</button>' : "") + '</span></div><pre><code>' + esc(b.code) + "</code></pre></div>";
}
function tableHtml(rows) {
  const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const head = cells(rows[0]);
  const hasSep = rows[1] && /^[\s|:-]+$/.test(rows[1]);
  const body = rows.slice(hasSep ? 2 : 1);
  return '<div class="tbl"><table><thead><tr>' + head.map((c) => "<th>" + inline(esc(c)) + "</th>").join("") + "</tr></thead><tbody>" +
    body.map((r) => "<tr>" + cells(r).map((c) => "<td>" + inline(esc(c)) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
}
function md(src) {
  const blocks = [];
  src = String(src).replace(/```([\w+-]*)[^\S\n]*\n?([\s\S]*?)(?:```|$)/g, (m, lang, code) => {
    blocks.push({ lang, code: code.replace(/\n$/, "") });
    return "\n\u0000" + (blocks.length - 1) + "\u0000\n";
  });
  const lines = src.split("\n");
  let out = "", list = null, para = [];
  const flushPara = () => { if (para.length) { out += "<p>" + inline(esc(para.join("\n"))).replace(/\n/g, "<br>") + "</p>"; para = []; } };
  const closeList = () => { if (list) { out += "</" + list + ">"; list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; let m;
    if ((m = line.match(/^\u0000(\d+)\u0000$/))) { flushPara(); closeList(); out += codeBlock(blocks[+m[1]]); continue; }
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara(); closeList();
      const rows = [line];
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) rows.push(lines[++i]);
      out += tableHtml(rows); continue;
    }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); closeList(); const n = m[1].length + 1; out += "<h" + n + ">" + inline(esc(m[2])) + "</h" + n + ">"; continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flushPara(); closeList(); out += "<hr>"; continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { flushPara(); if (list !== "ul") { closeList(); out += "<ul>"; list = "ul"; } out += "<li>" + inline(esc(m[1])) + "</li>"; continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (list !== "ol") { closeList(); out += "<ol>"; list = "ol"; } out += "<li>" + inline(esc(m[1])) + "</li>"; continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); closeList(); out += "<blockquote>" + inline(esc(m[1])) + "</blockquote>"; continue; }
    closeList(); para.push(line);
  }
  flushPara(); closeList();
  return out;
}

/* ---------- motores de IA ---------- */
async function cloudChat(messages, { onToken, temperature = 0.7 }) {
  const ctrl = new AbortController();
  currentAbort = ctrl;
  const timer = setTimeout(() => ctrl.abort(), 60000);
  let full = "";
  try {
    const res = await fetch(CLOUD_URL, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ model: "openai", messages, stream: true, temperature, private: true })
    });
    if (!res.ok) throw new Error("La nube respondió " + res.status);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("event-stream") || !res.body) {
      const txt = await res.text();
      try { full = JSON.parse(txt).choices[0].message.content || ""; } catch (e) { full = txt; }
      if (full) onToken(full);
    } else {
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", first = true;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const d = line.slice(5).trim();
          if (!d || d === "[DONE]") continue;
          try {
            const t = JSON.parse(d).choices[0].delta.content;
            if (t) { if (first) { clearTimeout(timer); first = false; } full += t; onToken(full); }
          } catch (e) {}
        }
      }
    }
    if (!full.trim() && !stopRequested) throw new Error("respuesta vacía");
    return full;
  } catch (err) {
    if (stopRequested) return full;
    throw err;
  } finally { clearTimeout(timer); currentAbort = null; }
}

let localEngine = null, localKey = null, localLoading = null;
async function ensureLocal(base) {
  if (!navigator.gpu) throw new Error("Tu navegador no admite WebGPU (necesario para la IA local). Usa Chrome o Edge actualizados, o el modo ☁ Nube.");
  if (localEngine && localKey === base) return localEngine;
  if (localLoading && localLoading.key === base) return localLoading.p;
  const p = (async () => {
    const webllm = await import(WEBLLM_URL);
    let f16 = false;
    try { const a = await navigator.gpu.requestAdapter(); f16 = !!(a && a.features.has("shader-f16")); } catch (e) {}
    const avail = new Set(webllm.prebuiltAppConfig.model_list.map((m) => m.model_id));
    const cands = ["Qwen2.5-" + base + "-Instruct-q4f16_1-MLC", "Qwen2.5-" + base + "-Instruct-q4f32_1-MLC"];
    if (!f16) cands.reverse();
    const id = cands.find((c) => avail.has(c)) || cands[0];
    if (localEngine) { try { await localEngine.unload(); } catch (e) {} localEngine = null; }
    showLoad(0, "Preparando…");
    const eng = await webllm.CreateMLCEngine(id, { initProgressCallback: (r) => showLoad(Math.round((r.progress || 0) * 100), r.text) });
    localEngine = eng; localKey = base; hideLoad();
    return eng;
  })();
  localLoading = { key: base, p };
  p.catch(() => hideLoad()).finally(() => { if (localLoading && localLoading.p === p) localLoading = null; });
  return p;
}
function trimForLocal(messages, limit) {
  const sys = messages[0].role === "system" ? [messages[0]] : [];
  const rest = messages.slice(sys.length);
  let total = sys.reduce((n, m) => n + m.content.length, 0);
  const kept = [];
  for (let i = rest.length - 1; i >= 0; i--) {
    const l = rest[i].content.length;
    if (total + l > limit && kept.length) break;
    total += l; kept.unshift(rest[i]);
  }
  return [...sys, ...kept];
}
async function localChat(messages, { onToken, base, temperature = 0.6, maxTokens = 1024 }) {
  const eng = await ensureLocal(base);
  const flat = messages.map((m) => Array.isArray(m.content) ? { ...m, content: m.content.filter((p) => p.type === "text").map((p) => p.text).join("\n") } : m);
  const msgs = trimForLocal(flat, 7000);
  const est = Math.ceil(JSON.stringify(msgs).length / 3);
  const max = Math.max(256, Math.min(maxTokens, 4000 - est));
  let full = "";
  const stream = await eng.chat.completions.create({ messages: msgs, stream: true, temperature, max_tokens: max });
  for await (const ch of stream) {
    const t = (ch.choices[0] && ch.choices[0].delta && ch.choices[0].delta.content) || "";
    if (t) { full += t; onToken(full); }
    if (stopRequested) { try { eng.interruptGenerate(); } catch (e) {} break; }
  }
  return full;
}
async function generate(messages, { onToken = () => {}, temperature = 0.7, maxTokens = 1500 } = {}) {
  stopRequested = false;
  if (mode === "cloud") {
    try { return await cloudChat(messages, { onToken, temperature }); }
    catch (err) {
      if (stopRequested) return "";
      if (!navigator.gpu) throw new Error("La IA en la nube no responde ahora mismo (" + err.message + ") y tu navegador no admite IA local. Inténtalo en unos minutos.");
      toast("La nube no responde. Usando IA local (la primera vez descarga el modelo)…");
      return await localChat(messages, { onToken, base: "0.5B", temperature, maxTokens });
    }
  }
  return localChat(messages, { onToken, base: MODES[mode].base, temperature, maxTokens });
}
function stopGeneration() {
  stopRequested = true;
  if (currentAbort) currentAbort.abort();
  if (localEngine) { try { localEngine.interruptGenerate(); } catch (e) {} }
}

/* ---------- conocimiento: Wikipedia (modo local) y documentos ---------- */
function looksFactual(q) {
  return q.length > 12 && (/\?/.test(q) || /^(qu[eé]|qui[eé]n|cu[aá]ndo|d[oó]nde|c[oó]mo|cu[aá]l|cu[aá]nt|por qu[eé]|explica|h[aá]blame|dime|define|resume)/i.test(q.trim()));
}
async function wikiContext(query, ms = 3500) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const base = "https://es.wikipedia.org/w/api.php?format=json&origin=*&action=query";
    const s = await (await fetch(base + "&list=search&srlimit=2&srsearch=" + encodeURIComponent(query.slice(0, 200)), { signal: ctrl.signal })).json();
    const hits = (s.query && s.query.search) || [];
    if (!hits.length) return "";
    const e = await (await fetch(base + "&prop=extracts&exintro=1&explaintext=1&exchars=1000&pageids=" + hits.map((h) => h.pageid).join("|"), { signal: ctrl.signal })).json();
    const pages = (e.query && e.query.pages) || {};
    const parts = hits.map((h) => (pages[h.pageid] ? "[" + h.title + "] " + (pages[h.pageid].extract || "").trim() : "")).filter(Boolean);
    return parts.length ? "\n\nInformación de Wikipedia (úsala solo si es relevante):\n" + parts.join("\n\n") : "";
  } catch (e) { return ""; } finally { clearTimeout(timer); }
}
let activeDoc = null;
function chunkText(text, size = 900) {
  const chunks = []; let cur = "";
  for (const p of text.split(/\n+/)) {
    if ((cur + " " + p).length > size && cur) { chunks.push(cur.trim()); cur = p; } else cur += " " + p;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}
function docContext(question) {
  if (!activeDoc) return "";
  const full = activeDoc.text;
  const limit = mode === "cloud" ? 9000 : 2600;
  if (full.length <= limit) return "\n\nDocumento adjunto «" + activeDoc.name + "»:\n" + full;
  const words = (question.toLowerCase().match(/[a-záéíóúñü0-9]{4,}/g) || []);
  const scored = activeDoc.chunks.map((c, i) => ({ c, i, s: words.reduce((n, w) => n + (c.toLowerCase().includes(w) ? 1 : 0), 0) }));
  let picked = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!picked.length) picked = scored.slice(0, 3);
  let total = 0; const out = [];
  for (const x of picked) { if (total + x.c.length > limit) break; out.push(x); total += x.c.length; }
  out.sort((a, b) => a.i - b.i);
  return "\n\nFragmentos relevantes del documento «" + activeDoc.name + "»:\n" + out.map((x) => x.c).join("\n---\n");
}
function setActiveDoc(name, text) {
  activeDoc = { name, text, chunks: chunkText(text) };
  $("docChip").hidden = false; $("docChipName").textContent = name;
}
function clearActiveDoc() { activeDoc = null; $("docChip").hidden = true; }

/* ---------- chats ---------- */
let chats = store.get("nubi-chats-v2", []);
let currentId = null;
function saveChats() { store.set("nubi-chats-v2", chats.slice(0, 30).map((c) => ({ ...c, messages: c.messages.filter((m) => !m.error).slice(-60).map(({ _full, ...rest }) => rest) }))); }
function currentChat() { return chats.find((c) => c.id === currentId) || null; }
function newChat() {
  const c = { id: "c" + Date.now() + Math.random().toString(36).slice(2, 6), title: "Nuevo chat", messages: [], updated: Date.now() };
  chats.unshift(c); currentId = c.id; return c;
}
function ensureChat() { return currentChat() || newChat(); }
function renderHistory() {
  const box = $("history"); box.innerHTML = "";
  const list = chats.filter((c) => c.messages.length).sort((a, b) => b.updated - a.updated).slice(0, 25);
  if (!list.length) { box.innerHTML = '<p class="empty-history">Tus conversaciones aparecerán aquí.</p>'; return; }
  list.forEach((c) => {
    const row = document.createElement("div"); row.className = "history-row" + (c.id === currentId ? " active" : "");
    const b = document.createElement("button"); b.className = "history-entry"; b.textContent = c.title; b.title = c.title;
    b.addEventListener("click", () => { currentId = c.id; setView("chat"); renderMessages(); renderHistory(); });
    const d = document.createElement("button"); d.className = "history-del"; d.textContent = "×"; d.title = "Borrar"; d.setAttribute("aria-label", "Borrar conversación");
    d.addEventListener("click", () => { chats = chats.filter((x) => x.id !== c.id); if (currentId === c.id) currentId = null; saveChats(); renderMessages(); renderHistory(); });
    row.appendChild(b); row.appendChild(d); box.appendChild(row);
  });
}
const IMG_RE = /^(?:\/imagen\b|(?:genera|crea|dibuja|haz|hazme|cr[eé]ame|dame|pinta)\s+(?:me\s+)?(?:una?\s+)?(?:imagen|foto|dibujo|ilustraci[oó]n|logo|p[oó]ster|poster)\b)/i;
const VIDEO_RE = /^(?:\/v[ií]deo\b|(?:crea|genera|haz|hazme|cr[eé]ame)\s+(?:me\s+)?(?:un\s+)?(?:v[ií]deo|animaci[oó]n|clip)\b)/i;
const WEB_RE = /^(?:\/web\b|(?:crea|haz|hazme|genera|constr[uú]ye|programa|cr[eé]ame)\s+(?:me\s+)?(?:una?\s+)?(?:web|p[aá]gina(?:\s+web)?|landing|sitio\s+web|app|aplicaci[oó]n|juego)\b)/i;

function systemPrompt(extra) {
  const d = new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return "Eres NUBI, un asistente de IA muy competente, claro y amable. Hoy es " + d + ". Responde en el idioma del usuario (normalmente español). Sé directo; usa Markdown (listas, **negrita**, tablas y bloques de código con su lenguaje). Para código, da soluciones completas y explica cómo usarlas. Analiza cuidadosamente las preguntas y comprueba cálculos y código antes de responder, pero no muestres razonamientos internos privados; ofrece una explicación clara y verificable; en respuestas largas empieza por la conclusión. Si la pregunta es ambigua, asume lo más razonable y dilo en una línea. Si algo puede haber cambiado (precios, noticias, cargos), avisa de que puede estar desactualizado. No inventes datos; si no estás seguro, dilo. Si te piden una web, entrega un único archivo HTML completo dentro de un bloque ```html. La app de NUBI permite al usuario escribir «dibuja …» para generar imágenes y «crea una web de …» para construir páginas." + (extra || "");
}
function toModelMessages(msgs) {
  const list = msgs.filter((m) => !m.error).slice(-8);
  let imgBudget = 20; const out = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    let content = m.image ? "[Imagen generada: " + m.image.prompt + "]" : m.content;
    if (m.role === "user" && m.imgs && m.imgs.length) {
      if (m._full && m._full.length && imgBudget > 0 && mode === "cloud") {
        imgBudget--;
        content = [{ type: "text", text: m.content }, ...m._full.map((u) => ({ type: "image_url", image_url: { url: u } }))];
      } else content = m.content + " [el usuario adjuntó " + m.imgs.length + " imagen(es)]";
    }
    out.unshift({ role: m.role, content });
  }
  return out;
}
const messagesBox = $("messages"), welcome = $("welcome"), promptBox = $("prompt");

function messageEl(m, i, isLast) {
  const row = document.createElement("div"); row.className = "message " + m.role;
  if (m.role === "assistant") { const av = document.createElement("div"); av.className = "message-avatar"; av.textContent = "N"; row.appendChild(av); }
  const col = document.createElement("div"); col.className = "msg-col";
  const bubble = document.createElement("div"); bubble.className = "message-bubble";
  if (m.role === "user") {
    if (m.imgs && m.imgs.length) { const g = document.createElement("div"); g.className = "thumbs"; m.imgs.forEach((u) => { const im = document.createElement("img"); im.src = u; im.alt = "Imagen adjunta"; g.appendChild(im); }); bubble.appendChild(g); }
    const tn = document.createElement("div"); tn.textContent = m.content; bubble.appendChild(tn);
  }
  else if (m.image) {
    bubble.classList.add("img-bubble");
    const img = document.createElement("img"); img.src = m.image.url; img.alt = m.image.prompt; img.loading = "lazy";
    const cap = document.createElement("div"); cap.className = "img-actions";
    const dl = document.createElement("button"); dl.textContent = "Descargar"; dl.addEventListener("click", () => downloadUrl(m.image.url, "nubi-imagen.png"));
    cap.appendChild(dl); bubble.appendChild(img); bubble.appendChild(cap);
  } else { bubble.classList.add("md"); bubble.innerHTML = md(m.content); }
  col.appendChild(bubble);
  if (m.role === "assistant") {
    const act = document.createElement("div"); act.className = "msg-actions";
    if (!m.image && !m.error) {
      const cp = document.createElement("button"); cp.textContent = "Copiar"; cp.addEventListener("click", () => { copyText(m.content); toast("Copiado"); }); act.appendChild(cp);
    }
    if (isLast && !m.image) {
      const rg = document.createElement("button"); rg.textContent = m.error ? "Reintentar" : "Regenerar";
      rg.addEventListener("click", () => { const c = currentChat(); c.messages.pop(); respond(c); }); act.appendChild(rg);
    }
    col.appendChild(act);
  }
  row.appendChild(col);
  return row;
}
function renderMessages() {
  const c = currentChat(); messagesBox.innerHTML = "";
  const has = !!(c && c.messages.length);
  welcome.style.display = has ? "none" : ""; messagesBox.style.display = has ? "" : "none";
  if (has) c.messages.forEach((m, i) => messagesBox.appendChild(messageEl(m, i, i === c.messages.length - 1)));
  messagesBox.scrollTop = messagesBox.scrollHeight;
}
function setBusy(v) {
  busy = v; const b = $("sendBtn"); b.textContent = v ? "■" : "↑"; b.title = v ? "Detener" : "Enviar"; b.classList.toggle("stop", v);
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(() => {});
  else { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); }
}

async function respond(chat) {
  setBusy(true);
  messagesBox.style.display = ""; welcome.style.display = "none"; renderMessages();
  const row = messageEl({ role: "assistant", content: "" }, 0, false);
  row.querySelector(".msg-actions").remove();
  const bubble = row.querySelector(".message-bubble"); bubble.classList.add("md");
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  messagesBox.appendChild(row); messagesBox.scrollTop = messagesBox.scrollHeight;
  try {
    const lastUser = [...chat.messages].reverse().find((m) => m.role === "user").content;
    let extra = docContext(lastUser);
    if (wikiEnabled && !activeDoc && looksFactual(lastUser)) extra += await wikiContext(lastUser, mode === "cloud" ? 2000 : 3500);
    const msgs = [{ role: "system", content: systemPrompt(extra) }, ...toModelMessages(chat.messages)];
    const reply = await generate(msgs, { onToken: (t) => { bubble.innerHTML = md(t); messagesBox.scrollTop = messagesBox.scrollHeight; } });
    chat.messages.push({ role: "assistant", content: reply.trim() || "(Se detuvo la respuesta.)" });
  } catch (err) {
    chat.messages.push({ role: "assistant", content: "⚠️ No he podido responder.\n\n" + (err && err.message ? err.message : err), error: true });
  } finally {
    chat.updated = Date.now(); setBusy(false); saveChats(); renderMessages(); renderHistory();
  }
}
let pendingImages = [];
async function sendMessage(text) {
  const value = (text !== undefined ? text : promptBox.value).trim();
  const imgs = pendingImages;
  if ((!value && !imgs.length) || busy) return;
  if (imgs.length && mode !== "cloud") { toast("Para analizar imágenes usa el modo ☁ Nube rápida: los modelos locales no ven imágenes."); return; }
  promptBox.value = ""; autoresize();
  setView("chat");
  if (!imgs.length) {
    if (IMG_RE.test(value)) { await chatImage(value.replace(/^\/imagen\s*/i, "")); return; }
    if (VIDEO_RE.test(value)) { setView("video"); $("videoPrompt").value = value.replace(/^\/v[ií]deo\s*/i, ""); buildVideo($("videoPrompt").value, false); return; }
    if (WEB_RE.test(value)) { setView("web"); $("webPrompt").value = value.replace(/^\/web\s*/i, ""); buildWeb($("webPrompt").value); return; }
  }
  const chat = ensureChat();
  const msg = { role: "user", content: value || "Describe esta imagen en detalle." };
  if (imgs.length) { msg.imgs = imgs.map((i) => i.thumb); msg._full = imgs.map((i) => i.full); pendingImages = []; renderStrip(); }
  chat.messages.push(msg);
  if (chat.title === "Nuevo chat") chat.title = (value || "Imagen").slice(0, 48);
  chat.updated = Date.now(); saveChats(); renderHistory();
  await respond(chat);
}
function fileToImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const render = (max, q) => {
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", q);
      };
      try { res({ full: render(1024, 0.82), thumb: render(160, 0.6) }); } catch (e) { rej(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("No se pudo leer la imagen.")); };
    img.src = url;
  });
}
async function addPendingImage(file) {
  try { pendingImages.push(await fileToImage(file)); renderStrip(); if (mode !== "cloud") toast("Para que NUBI vea la imagen cambia al modo ☁ Nube rápida."); }
  catch (e) { toast(e.message || "No se pudo añadir la imagen."); }
}
function renderStrip() {
  const strip = $("attachStrip"); strip.innerHTML = ""; strip.hidden = !pendingImages.length;
  pendingImages.forEach((im, i) => {
    const d = document.createElement("div"); d.className = "att";
    const img = document.createElement("img"); img.src = im.thumb; img.alt = "Imagen adjunta";
    const b = document.createElement("button"); b.textContent = "×"; b.setAttribute("aria-label", "Quitar imagen"); b.addEventListener("click", () => { pendingImages.splice(i, 1); renderStrip(); });
    d.appendChild(img); d.appendChild(b); strip.appendChild(d);
  });
}
async function chatImage(prompt) {
  const chat = ensureChat();
  chat.messages.push({ role: "user", content: "🖼 " + prompt });
  if (chat.title === "Nuevo chat") chat.title = prompt.slice(0, 48);
  setBusy(true); renderMessages();
  const row = messageEl({ role: "assistant", content: "" }, 0, false); row.querySelector(".msg-actions").remove();
  row.querySelector(".message-bubble").innerHTML = '<span class="typing"><i></i><i></i><i></i></span> Generando imagen…';
  messagesBox.appendChild(row); messagesBox.scrollTop = messagesBox.scrollHeight;
  try {
    const r = await makeImage({ prompt, style: "real", size: "square", seed: Math.floor(Math.random() * 1e6), svg: false });
    chat.messages.push({ role: "assistant", content: "", image: { url: r.url, prompt } });
    addToGallery({ url: r.url, prompt });
  } catch (err) {
    chat.messages.push({ role: "assistant", content: "⚠️ No pude generar la imagen.\n\n" + err.message, error: true });
  } finally { chat.updated = Date.now(); setBusy(false); saveChats(); renderMessages(); renderHistory(); }
}

/* ---------- imágenes ---------- */
const IMG_STYLES = {
  real: ", fotografía realista, alta calidad, muy detallado, iluminación cinematográfica",
  anime: ", anime style, vibrant colors, highly detailed, studio quality",
  pixel: ", pixel art, 16-bit, retro game style, crisp pixels",
  "3d": ", 3D render, soft lighting, high detail, octane render",
  oil: ", oil painting, textured brush strokes, masterpiece",
  logo: ", minimalist vector logo, flat design, clean shapes, white background",
  none: ""
};
const IMG_SIZES = { square: [1024, 1024], wide: [1280, 720], tall: [720, 1280] };
let gallery = store.get("nubi-gallery", []);
function addToGallery(item) { gallery.unshift(item); store.set("nubi-gallery", gallery); renderGallery(); }
function loadImage(url, timeout) {
  return new Promise((res, rej) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ""; rej(new Error("tiempo agotado")); }, timeout);
    img.onload = () => { clearTimeout(t); res(url); };
    img.onerror = () => { clearTimeout(t); rej(new Error("error de carga")); };
    img.src = url;
  });
}
async function generateSvg(prompt) {
  const msgs = [
    { role: "system", content: 'Eres un ilustrador experto en SVG. Devuelve SOLO un bloque ```svg con un único elemento <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"> completo, atractivo y detallado: usa degradados, formas superpuestas, fondo y composición cuidada. Sin texto explicativo, sin scripts.' },
    { role: "user", content: "Ilustración de: " + prompt }
  ];
  const out = await generate(msgs, { temperature: 0.8, maxTokens: 3000 });
  const m = out.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) throw new Error("La IA no devolvió un SVG válido. Inténtalo de nuevo.");
  const clean = m[0].replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "");
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(clean);
}
async function makeImage({ prompt, style, size, seed, svg }) {
  if (!svg) {
    const [w, h] = IMG_SIZES[size] || IMG_SIZES.square;
    const full = encodeURIComponent(prompt + (IMG_STYLES[style] || ""));
    const qs = "?width=" + w + "&height=" + h + "&seed=" + seed + "&nologo=true&model=flux";
    const key = store.get("nubi-pkey", "");
    if (key) { try { return { url: await loadImage("https://gen.pollinations.ai/image/" + full + qs + "&key=" + encodeURIComponent(key), 60000), kind: "ai" }; } catch (e) { toast("La clave de Pollinations no funcionó; uso el modo gratuito."); } }
    try { return { url: await loadImage("https://image.pollinations.ai/prompt/" + full + qs, 60000), kind: "ai" }; } catch (e) {}
    try { return { url: await loadImage("https://pollinations.ai/p/" + full + qs, 45000), kind: "ai" }; } catch (e) {}
    toast("El servicio de imágenes no responde. Dibujo un SVG con la IA.");
  }
  return { url: await generateSvg(prompt), kind: "svg" };
}
async function downloadUrl(url, name) {
  try {
    const b = await (await fetch(url)).blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  } catch (e) { window.open(url, "_blank"); }
}
function renderGallery() {
  const g = $("gallery"); g.innerHTML = ""; $("galleryTitle").hidden = !gallery.length;
  gallery.forEach((it) => {
    const fig = document.createElement("figure");
    const img = document.createElement("img"); img.src = it.url; img.alt = it.prompt; img.loading = "lazy";
    const cap = document.createElement("figcaption"); cap.textContent = it.prompt;
    const act = document.createElement("div"); act.className = "gal-actions";
    [["Descargar", () => downloadUrl(it.url, "nubi-imagen.png")], ["Reusar", () => { $("imagePrompt").value = it.prompt; $("imagePrompt").focus(); }]].forEach(([t, fn]) => {
      const b = document.createElement("button"); b.textContent = t; b.addEventListener("click", fn); act.appendChild(b);
    });
    fig.appendChild(img); fig.appendChild(cap); fig.appendChild(act); g.appendChild(fig);
  });
}
let imgBusy = false;
async function generateImageUI() {
  const prompt = $("imagePrompt").value.trim();
  if (!prompt) { toast("Escribe primero una descripción."); return; }
  if (imgBusy) return;
  imgBusy = true; $("imageGo").disabled = true;
  const stage = $("imageStage"); stage.hidden = false;
  stage.innerHTML = '<div class="skeleton"><span class="typing"><i></i><i></i><i></i></span><p>Generando… puede tardar entre 10 y 40 segundos.</p></div>';
  try {
    const r = await makeImage({ prompt, style: $("imageStyle").value, size: $("imageSize").value, seed: Math.floor(Math.random() * 1e6), svg: $("imageSvg").checked });
    stage.innerHTML = "";
    const img = document.createElement("img"); img.src = r.url; img.alt = prompt;
    const act = document.createElement("div"); act.className = "gal-actions";
    [["Descargar", () => downloadUrl(r.url, "nubi-imagen.png")], ["Otra variación", generateImageUI]].forEach(([t, fn]) => { const b = document.createElement("button"); b.textContent = t; b.addEventListener("click", fn); act.appendChild(b); });
    stage.appendChild(img); stage.appendChild(act);
    addToGallery({ url: r.url, prompt });
  } catch (err) {
    stage.innerHTML = '<div class="skeleton error"><p>⚠️ ' + esc(err.message) + "</p></div>";
  } finally { imgBusy = false; $("imageGo").disabled = false; }
}

/* ---------- constructor de webs ---------- */
const WEB_SYSTEM = "Eres un diseñador y desarrollador web experto. Devuelve SIEMPRE un único archivo HTML completo (<!DOCTYPE html>…) con el CSS en <style> y el JavaScript en <script>, sin dependencias externas (salvo Google Fonts opcional). Diseño moderno, responsive, accesible y cuidado: buena tipografía, espaciado, colores armoniosos, sombras y transiciones suaves. Usa contenido real y creíble en español (nada de lorem ipsum) y haz que las interacciones funcionen de verdad. Para imágenes usa gradientes, SVG o emojis (no enlaces externos). Responde SOLO con un bloque ```html, sin explicaciones.";
let webCode = "", webBusy = false, webRef = null;
function extractHtml(t) {
  const m = t.match(/```(?:html)?[^\S\n]*\n?([\s\S]*?)(?:```|$)/i);
  const code = m ? m[1] : t;
  return code.trim();
}
function setPreview(html) {
  const f = $("webFrame"); f.srcdoc = html; f.hidden = false; $("webEmpty").hidden = true;
  $("webCodeView").textContent = html;
  showTab(document.querySelector(".tab.active") && document.querySelector(".tab.active").id === "tabCode" ? "code" : "preview");
}
function showTab(t) {
  $("tabPreview").classList.toggle("active", t === "preview"); $("tabCode").classList.toggle("active", t === "code");
  $("webFrame").hidden = t !== "preview" || !webCode; $("webCodeView").hidden = t !== "code";
  $("webEmpty").hidden = !!webCode || t === "code";
}
async function buildWeb(promptText, revise) {
  promptText = (promptText || "").trim();
  if (!promptText || webBusy) { if (!promptText) toast("Describe primero tu web."); return; }
  if (webRef && mode !== "cloud") { toast("La imagen de referencia solo funciona en el modo ☁ Nube rápida."); return; }
  webBusy = true; $("webGo").disabled = true; $("webReviseGo").disabled = true;
  const label = $("webGo"); const old = label.innerHTML; label.innerHTML = "Creando… <span>⏳</span>";
  const codeLimit = mode === "cloud" ? 30000 : 4500;
  const msgs = revise && webCode
    ? [{ role: "system", content: WEB_SYSTEM }, { role: "user", content: "Este es el código actual:\n```html\n" + webCode.slice(0, codeLimit) + "\n```\n\nAplica estos cambios y devuelve el archivo HTML COMPLETO actualizado: " + promptText }]
    : [{ role: "system", content: WEB_SYSTEM }, { role: "user", content: promptText }];
  if (webRef) {
    const lastMsg = msgs[msgs.length - 1];
    lastMsg.content = [{ type: "text", text: lastMsg.content + "\n\nUsa la imagen adjunta como referencia de diseño (estructura, estilo, colores y contenido) y réplicala o adáptala en HTML/CSS." }, { type: "image_url", image_url: { url: webRef.full } }];
    webRef = null; $("webRefName").hidden = true;
  }
  let last = 0;
  if (!revise) { webCode = ""; $("webFrame").hidden = true; $("webEmpty").hidden = false; $("webEmpty").innerHTML = '<span class="typing"><i></i><i></i><i></i></span><p>Escribiendo tu web…</p>'; }
  try {
    const out = await generate(msgs, {
      temperature: 0.6, maxTokens: 4000,
      onToken: (t) => {
        const code = extractHtml(t); $("webCodeView").textContent = code;
        const now = Date.now();
        if (now - last > 1500 && /<body/i.test(code) && code.length > 400) { last = now; webCode = code; setPreview(code); }
      }
    });
    const code = extractHtml(out);
    if (!code || !/<\w+/.test(code)) throw new Error("La IA no devolvió código HTML. Inténtalo de nuevo.");
    webCode = code; setPreview(code); $("reviseBox").hidden = false;
  } catch (err) {
    toast(err.message);
    if (!webCode) { $("webEmpty").hidden = false; $("webEmpty").innerHTML = "<p>⚠️ " + esc(err.message) + "</p>"; }
  } finally { webBusy = false; $("webGo").disabled = false; $("webReviseGo").disabled = false; label.innerHTML = old; }
}
function openWebCode(code) {
  setView("web"); webCode = code; setPreview(code); $("reviseBox").hidden = false;
}
function setDevice(w) { $("frameWrap").style.setProperty("--fw", w); }

/* ---------- vídeos (animaciones de canvas grabadas en el navegador) ---------- */
const VIDEO_SYSTEM = "Eres un animador de gráficos en movimiento experto en Canvas 2D. Devuelve SOLO un bloque ```js que defina function draw(ctx, t, W, H) { ... }. ctx es un CanvasRenderingContext2D de tamaño W×H; t son los segundos transcurridos (de 0 a la duración total); draw se llama unas 30 veces por segundo y debe pintar el fotograma COMPLETO cada vez (rellena el fondo primero). Sin librerías, sin DOM, sin red. No uses Math.random() dentro de draw: usa t y funciones deterministas, o genera datos una sola vez fuera de draw con un generador pseudoaleatorio con semilla. Crea una animación vistosa: escenas con transiciones suaves (easing), degradados, formas, partículas y texto con ctx.fillText en español. Escala todo con W y H. Reparte las escenas a lo largo de la duración total indicada.";
let videoCode = "", videoBusy = false;
const VIDEO_DIMS = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1024, 1024] };
function extractCode(t) {
  const m = t.match(/```(?:js|javascript)?[^\S\n]*\n?([\s\S]*?)(?:```|$)/i);
  return (m ? m[1] : t).trim();
}
function videoHarness(code, W, H, dur) {
  const c = JSON.stringify(code).replace(/</g, "\\u003c");
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000}canvas{width:100%;height:100%;display:block}</style></head><body><canvas id="c" width="' + W + '" height="' + H + '"></canvas><script>' +
  'const W=' + W + ',H=' + H + ',DUR=' + dur + ';const cv=document.getElementById("c"),ctx=cv.getContext("2d");let draw=null,errSent=false;' +
  'function err(m){if(!errSent){errSent=true;parent.postMessage({type:"nubi-error",msg:String(m)},"*");}}' +
  'const CODE=' + c + ';try{draw=(new Function(CODE+"\\n;return (typeof draw===\'function\')?draw:null;"))();}catch(e){err(e);}' +
  'if(!draw)err("La animación no definió la función draw.");' +
  'let rec=false,start=performance.now(),mr=null,chunks=[],n=0;' +
  'function frame(now){let t=(now-start)/1000;if(rec){if(t>=DUR){rec=false;try{mr.stop();}catch(e){}t=DUR;}}else t=t%DUR;' +
  'if(draw){try{ctx.save();ctx.clearRect(0,0,W,H);draw(ctx,t,W,H);ctx.restore();}catch(e){err(e);}}' +
  'if(rec&&(n++%8===0))parent.postMessage({type:"nubi-progress",p:Math.min(1,t/DUR)},"*");requestAnimationFrame(frame);}' +
  'function startRec(){if(rec)return;const types=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm","video/mp4"];' +
  'const mt=window.MediaRecorder&&types.find(x=>MediaRecorder.isTypeSupported(x));if(!mt){err("Tu navegador no puede grabar vídeo. Usa Chrome, Edge o Firefox.");return;}' +
  'mr=new MediaRecorder(cv.captureStream(30),{mimeType:mt,videoBitsPerSecond:6000000});chunks=[];mr.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};' +
  'mr.onstop=()=>{parent.postMessage({type:"nubi-video",blob:new Blob(chunks,{type:mt.split(";")[0]})},"*");};mr.start(250);start=performance.now();rec=true;}' +
  'addEventListener("message",e=>{if(e.data&&e.data.cmd==="record")startRec();});requestAnimationFrame(frame);' +
  '<\/script></body></html>';
}
function setVideoPreview() {
  const [W, H] = VIDEO_DIMS[$("videoRatio").value] || VIDEO_DIMS["16:9"];
  const dur = +$("videoDur").value || 8;
  $("videoStage").style.setProperty("--ar", W + "/" + H);
  $("videoStage").style.setProperty("--sw", "min(100%," + Math.round(68 * W / H) + "vh)");
  $("videoFrame").srcdoc = videoHarness(videoCode, W, H, dur);
  $("videoFrame").hidden = false; $("videoEmpty").hidden = true; $("videoRecord").disabled = false;
}
async function buildVideo(promptText, revise) {
  promptText = (promptText || "").trim();
  if (!promptText || videoBusy) { if (!promptText) toast("Describe primero tu vídeo."); return; }
  videoBusy = true; $("videoGo").disabled = true; $("videoReviseGo").disabled = true;
  const [W, H] = VIDEO_DIMS[$("videoRatio").value] || VIDEO_DIMS["16:9"]; const dur = +$("videoDur").value || 8;
  const spec = "Duración total: " + dur + " segundos. Lienzo: " + W + "x" + H + " (" + $("videoRatio").value + ").";
  const msgs = revise && videoCode
    ? [{ role: "system", content: VIDEO_SYSTEM }, { role: "user", content: spec + "\nEste es el código actual:\n```js\n" + videoCode.slice(0, mode === "cloud" ? 20000 : 4500) + "\n```\nAplica estos cambios y devuelve el código COMPLETO actualizado: " + promptText }]
    : [{ role: "system", content: VIDEO_SYSTEM }, { role: "user", content: spec + "\nTema: " + promptText }];
  $("videoResult").hidden = true;
  if (!revise) { $("videoFrame").hidden = true; $("videoEmpty").hidden = false; $("videoEmpty").innerHTML = '<span class="typing"><i></i><i></i><i></i></span><p>Programando tu animación…</p>'; }
  try {
    const out = await generate(msgs, { temperature: 0.7, maxTokens: 3500 });
    const code = extractCode(out);
    if (!/function\s+draw\s*\(/.test(code)) throw new Error("La IA no devolvió una animación válida. Inténtalo de nuevo.");
    videoCode = code; setVideoPreview(); $("videoReviseBox").hidden = false;
  } catch (err) {
    toast(err.message);
    if (!videoCode) { $("videoEmpty").hidden = false; $("videoEmpty").innerHTML = "<p>⚠️ " + esc(err.message) + "</p>"; }
  } finally { videoBusy = false; $("videoGo").disabled = false; $("videoReviseGo").disabled = false; }
}
let lastVideoUrl = null;
window.addEventListener("message", (e) => {
  if (e.source !== $("videoFrame").contentWindow || !e.data) return;
  const d = e.data, btn = $("videoRecord");
  if (d.type === "nubi-progress") btn.textContent = "⏺ Grabando… " + Math.round(d.p * 100) + "%";
  else if (d.type === "nubi-error") { toast(d.msg); btn.disabled = !videoCode; btn.textContent = "⏺ Grabar y descargar"; }
  else if (d.type === "nubi-video") {
    btn.disabled = false; btn.textContent = "⏺ Grabar y descargar";
    if (lastVideoUrl) URL.revokeObjectURL(lastVideoUrl);
    lastVideoUrl = URL.createObjectURL(d.blob);
    const ext = d.blob.type.includes("mp4") ? "mp4" : "webm";
    const box = $("videoResult"); box.hidden = false; box.innerHTML = "";
    const v = document.createElement("video"); v.src = lastVideoUrl; v.controls = true; v.playsInline = true;
    const a = document.createElement("a"); a.href = lastVideoUrl; a.download = "nubi-video." + ext; a.className = "primary-button"; a.textContent = "Descargar vídeo (." + ext + ")";
    box.appendChild(v); box.appendChild(a); toast("¡Vídeo listo!");
  }
});

/* ---------- archivos ---------- */
let currentFileUrl = null, currentFile = null, currentFileText = "";
async function processFile(file) {
  currentFile = file; currentFileText = "";
  $("fileResult").hidden = false; $("fileName").textContent = file.name; $("ocrBtn").hidden = true; $("askDoc").hidden = true;
  const out = $("fileContent"); out.textContent = "Procesando archivo…";
  if (currentFileUrl) URL.revokeObjectURL(currentFileUrl);
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) {
    currentFileUrl = URL.createObjectURL(file);
    const img = document.createElement("img"); img.src = currentFileUrl; img.alt = "Vista previa de " + file.name;
    out.innerHTML = ""; out.appendChild(img);
    const p = document.createElement("p"); p.textContent = "Si la imagen contiene texto, puedes extraerlo con OCR y preguntar sobre él."; out.appendChild(p);
    $("ocrBtn").hidden = false; return;
  }
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    if (!window.pdfjsLib) { out.textContent = "No se pudo cargar el lector PDF. Comprueba tu conexión y vuelve a intentarlo."; return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    try {
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      let full = "";
      for (let n = 1; n <= Math.min(pdf.numPages, 40); n++) {
        const content = await (await pdf.getPage(n)).getTextContent();
        full += "\n" + content.items.map((x) => x.str).join(" ") + "\n";
      }
      currentFileText = full.trim();
      out.textContent = currentFileText || "No se ha encontrado texto seleccionable. Puede ser un PDF escaneado.";
      if (pdf.numPages > 40) out.textContent += "\n\nSe han leído las primeras 40 páginas.";
      $("askDoc").hidden = !currentFileText;
    } catch (e) { out.textContent = "No se pudo leer este PDF. Puede estar protegido o dañado."; }
    return;
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    currentFileText = (await file.text()).trim(); out.textContent = currentFileText.slice(0, 20000); $("askDoc").hidden = !currentFileText; return;
  }
  out.textContent = "Formato no compatible. Usa PDF, TXT, MD o una imagen.";
}
async function runOcr() {
  if (!currentFile) return;
  const out = $("fileContent"); const btn = $("ocrBtn"); btn.disabled = true;
  try {
    if (!window.Tesseract) {
      await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar el OCR.")); document.head.appendChild(s); });
    }
    toast("Leyendo texto… la primera vez descarga datos de idioma.");
    const r = await Tesseract.recognize(currentFile, "spa+eng");
    currentFileText = (r.data.text || "").trim();
    out.textContent = currentFileText || "No se encontró texto en la imagen.";
    $("askDoc").hidden = !currentFileText;
  } catch (e) { toast(e.message || "Falló el OCR."); } finally { btn.disabled = false; }
}

/* ---------- navegación y eventos ---------- */
function setView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active-view"));
  const t = $(name + "View"); if (t) t.classList.add("active-view");
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("crumb").textContent = { chat: "Chat inteligente", image: "Crear imágenes", web: "Webs y apps", video: "Vídeos", files: "Archivos y PDF" }[name] || "Chat";
  $("sidebar").classList.remove("open");
}
function autoresize() { promptBox.style.height = "auto"; promptBox.style.height = Math.min(promptBox.scrollHeight, 150) + "px"; }

document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("settingsBtn").addEventListener("click", () => { $("wikiToggle").checked = wikiEnabled; $("pollKey").value = store.get("nubi-pkey", ""); $("settingsModal").hidden = false; });
$("closeSettings").addEventListener("click", () => ($("settingsModal").hidden = true));
$("settingsModal").addEventListener("click", (e) => { if (e.target === $("settingsModal")) $("settingsModal").hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { $("settingsModal").hidden = true; $("frameWrap").classList.remove("fullscreen"); $("closeFull").hidden = true; } });
$("wikiToggle").addEventListener("change", (e) => { wikiEnabled = e.target.checked; store.set("nubi-wiki", wikiEnabled); });
$("clearData").addEventListener("click", () => {
  if (!confirm("¿Borrar todas las conversaciones y la galería?")) return;
  ["nubi-chats-v2", "nubi-gallery", "nubi-pkey"].forEach(store.del); chats = []; gallery = []; currentId = null;
  renderMessages(); renderHistory(); renderGallery(); $("settingsModal").hidden = true; toast("Datos borrados");
});
$("modelSelect").addEventListener("change", (e) => {
  mode = e.target.value; store.set("nubi-mode", mode); updateStatus();
  if (mode !== "cloud") { toast("Cargando IA local… la primera vez descarga el modelo."); ensureLocal(MODES[mode].base).catch((err) => { toast(err.message); }); }
});
$("sendBtn").addEventListener("click", () => (busy ? stopGeneration() : sendMessage()));
promptBox.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); } });
promptBox.addEventListener("input", autoresize);
$("newChat").addEventListener("click", () => { currentId = null; renderMessages(); renderHistory(); setView("chat"); promptBox.focus(); });
document.querySelectorAll(".suggestion").forEach((btn) => btn.addEventListener("click", () => {
  const a = btn.dataset.action, p = btn.dataset.prompt;
  if (a === "image") { setView("image"); $("imagePrompt").value = p; $("imagePrompt").focus(); }
  else if (a === "web") { setView("web"); $("webPrompt").value = p; $("webPrompt").focus(); }
  else if (a === "files") setView("files");
  else sendMessage(p);
}));
messagesBox.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const code = b.closest(".code").querySelector("code").textContent;
  if (b.dataset.act === "copy") { copyText(code); toast("Código copiado"); }
  else if (b.dataset.act === "open-web") openWebCode(code);
});
$("docChipClear").addEventListener("click", clearActiveDoc);

$("imageGo").addEventListener("click", generateImageUI);
$("webGo").addEventListener("click", () => buildWeb($("webPrompt").value, false));
$("webReviseGo").addEventListener("click", () => { const v = $("webRevise").value; if (v.trim()) { buildWeb(v, true); $("webRevise").value = ""; } });
document.querySelectorAll("#webChips button").forEach((b) => b.addEventListener("click", () => { $("webPrompt").value = b.dataset.p; $("webPrompt").focus(); }));
$("tabPreview").addEventListener("click", () => showTab("preview"));
$("tabCode").addEventListener("click", () => showTab("code"));
$("devDesktop").addEventListener("click", () => setDevice("100%"));
$("devTablet").addEventListener("click", () => setDevice("768px"));
$("devMobile").addEventListener("click", () => setDevice("390px"));
$("webCopy").addEventListener("click", () => { if (webCode) { copyText(webCode); toast("Código copiado"); } else toast("Aún no hay código."); });
$("webDownload").addEventListener("click", () => {
  if (!webCode) { toast("Aún no hay web que descargar."); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([webCode], { type: "text/html" })); a.download = "mi-web.html"; document.body.appendChild(a); a.click(); a.remove();
});
$("webFull").addEventListener("click", () => { $("frameWrap").classList.add("fullscreen"); $("closeFull").hidden = false; });
$("closeFull").addEventListener("click", () => { $("frameWrap").classList.remove("fullscreen"); $("closeFull").hidden = true; });

$("attachBtn").addEventListener("click", () => $("hiddenFileInput").click());
$("hiddenFileInput").addEventListener("change", (e) => {
  const f = e.target.files[0]; if (!f) return;
  if (f.type.startsWith("image/")) addPendingImage(f); else { setView("files"); processFile(f); }
  e.target.value = "";
});
promptBox.addEventListener("paste", (e) => { const it = [...(e.clipboardData ? e.clipboardData.items : [])].find((x) => x.type.startsWith("image/")); if (it) { e.preventDefault(); addPendingImage(it.getAsFile()); } });
$("chatView").addEventListener("dragover", (e) => e.preventDefault());
$("chatView").addEventListener("drop", (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f && f.type.startsWith("image/")) { e.preventDefault(); addPendingImage(f); } });
$("webAttach").addEventListener("click", () => $("webImgInput").click());
$("webImgInput").addEventListener("change", async (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try { webRef = await fileToImage(f); $("webRefLabel").textContent = f.name; $("webRefName").hidden = false; if (mode !== "cloud") toast("La imagen de referencia solo funciona en el modo ☁ Nube rápida."); } catch (err) { toast(err.message); }
});
$("webRefClear").addEventListener("click", () => { webRef = null; $("webRefName").hidden = true; });
$("videoGo").addEventListener("click", () => buildVideo($("videoPrompt").value, false));
$("videoReviseGo").addEventListener("click", () => { const v = $("videoRevise").value; if (v.trim()) { buildVideo(v, true); $("videoRevise").value = ""; } });
$("videoRecord").addEventListener("click", () => {
  const f = $("videoFrame"); if (!videoCode || !f.contentWindow) return;
  $("videoRecord").disabled = true; $("videoRecord").textContent = "⏺ Grabando… 0%"; f.contentWindow.postMessage({ cmd: "record" }, "*");
});
$("pollKey").addEventListener("change", (e) => { const v = e.target.value.trim(); if (v) store.set("nubi-pkey", v); else store.del("nubi-pkey"); toast(v ? "Clave guardada en este navegador" : "Clave borrada"); });
$("fileInput").addEventListener("change", (e) => { if (e.target.files[0]) processFile(e.target.files[0]); });
const drop = $("dropZone");
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.style.borderColor = "#a99aff"; }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.style.borderColor = ""; }));
drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) processFile(f); });
$("clearFile").addEventListener("click", () => { $("fileResult").hidden = true; $("fileInput").value = ""; $("fileContent").innerHTML = ""; if (currentFileUrl) URL.revokeObjectURL(currentFileUrl); currentFileUrl = null; currentFile = null; currentFileText = ""; });
$("askDoc").addEventListener("click", () => {
  if (!currentFileText) return;
  setActiveDoc(currentFile ? currentFile.name : "documento", currentFileText);
  setView("chat"); promptBox.value = "Hazme un resumen de este documento."; promptBox.focus(); autoresize();
});
$("ocrBtn").addEventListener("click", runOcr);

/* ---------- arranque ---------- */
updateStatus(); renderHistory(); renderMessages(); renderGallery();
if (mode !== "cloud" && navigator.gpu) {
  const warm = () => ensureLocal(MODES[mode].base).catch(() => {});
  if (window.requestIdleCallback) requestIdleCallback(warm); else setTimeout(warm, 1500);
}
