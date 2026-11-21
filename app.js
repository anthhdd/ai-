const $ = (id) => document.getElementById(id);
const promptBox = $("prompt");
const messages = $("messages");
const welcome = $("welcome");
let conversation = [];
let currentFileUrl = null;

function setView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
  const target = $(name + "View");
  if (target) target.classList.add("active-view");
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  const labels = {chat:"Chat IA",image:"Crear imágenes",files:"Archivos y PDF",code:"Programación"};
  $("crumb").textContent = labels[name] || "Chat IA";
  $("sidebar").classList.remove("open");
}
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
$("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("settingsBtn").addEventListener("click", () => $("settingsModal").hidden = false);
$("closeSettings").addEventListener("click", () => $("settingsModal").hidden = true);
$("settingsModal").addEventListener("click", e => { if (e.target === $("settingsModal")) $("settingsModal").hidden = true; });

function addMessage(text, role) {
  welcome.style.display = "none";
  const row = document.createElement("div");
  row.className = "message " + role;
  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "N";
    row.appendChild(avatar);
  }
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}
// ===== IA local: sin API key, sin servidor =====
// El modelo se descarga una vez y se ejecuta en tu navegador (WebGPU).
// Para ampliar su conocimiento, consulta Wikipedia en español (API pública, sin clave).
const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm";
const MODELS = ["Qwen2.5-1.5B-Instruct-q4f16_1-MLC", "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"];
const SYSTEM = "Eres NUBI, un asistente de IA útil, claro, amable y competente. Responde siempre en el idioma del usuario, normalmente español. Ayuda con programación, estudio, creatividad y análisis. Para código, da soluciones completas y explica dónde colocarlas. Si recibes información de Wikipedia, úsala solo si es relevante para la pregunta. Si no sabes algo con seguridad, dilo claramente y no inventes datos.";
let enginePromise = null;

async function searchWikipedia(query) {
  try {
    const q = encodeURIComponent(query.slice(0, 200));
    const base = "https://es.wikipedia.org/w/api.php?format=json&origin=*&action=query";
    const s = await (await fetch(base + "&list=search&srlimit=2&srsearch=" + q)).json();
    const hits = (s.query && s.query.search) || [];
    if (!hits.length) return [];
    const ids = hits.map(h => h.pageid).join("|");
    const e = await (await fetch(base + "&prop=extracts&exintro=1&explaintext=1&exchars=1200&pageids=" + ids)).json();
    const pages = (e.query && e.query.pages) || {};
    return hits.map(h => ({
      title: h.title,
      url: "https://es.wikipedia.org/?curid=" + h.pageid,
      text: ((pages[h.pageid] && pages[h.pageid].extract) || "").trim()
    })).filter(x => x.text);
  } catch (err) { return []; }
}

function getEngine(onProgress) {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const webllm = await import(WEBLLM_URL);
    let lastError;
    for (const model of MODELS) {
      try {
        return await webllm.CreateMLCEngine(model, {
          initProgressCallback: r => onProgress(Math.round((r.progress || 0) * 100), r.text)
        });
      } catch (err) { lastError = err; }
    }
    throw lastError || new Error("No se pudo cargar el modelo.");
  })();
  enginePromise.catch(() => { enginePromise = null; });
  return enginePromise;
}

async function askNubi(history, bubble) {
  const question = history[history.length - 1].content;
  bubble.textContent = "Buscando información…";
  const sources = question.length > 12 ? await searchWikipedia(question) : [];
  const sourceLinks = sources.length ? "\n\nFuentes: " + sources.map(s => s.title + " (" + s.url + ")").join(" · ") : "";

  if (!navigator.gpu) {
    if (sources.length) return "Tu navegador no admite IA local (WebGPU), así que te muestro lo que dice Wikipedia:\n\n" + sources[0].text + sourceLinks;
    throw new Error("Tu navegador no admite WebGPU. Prueba con Chrome o Edge actualizados en un ordenador o un móvil reciente.");
  }

  const engine = await getEngine((pct, text) => {
    bubble.textContent = "Descargando el cerebro de NUBI (solo la primera vez) " + pct + "%\n" + (text || "");
  });

  let context = "";
  if (sources.length) context = "\n\nInformación de Wikipedia:\n" + sources.map((s, i) => "[" + (i + 1) + "] " + s.title + ": " + s.text).join("\n\n");
  const msgs = [{role: "system", content: SYSTEM + context}, ...history.slice(-8)];

  bubble.textContent = "NUBI está pensando…";
  let reply = "";
  const stream = await engine.chat.completions.create({messages: msgs, stream: true, temperature: 0.6, max_tokens: 1024});
  for await (const chunk of stream) {
    reply += (chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) || "";
    bubble.textContent = reply;
    messages.scrollTop = messages.scrollHeight;
  }
  reply = reply.trim();
  if (!reply) throw new Error("El modelo no generó respuesta. Prueba con otro mensaje.");
  bubble.textContent = reply + sourceLinks;
  return reply + sourceLinks;
}
async function sendMessage(text) {
  const value = (text || promptBox.value).trim();
  if (!value) return;
  addMessage(value, "user");
  conversation.push({role:"user",content:value});
  promptBox.value = "";
  promptBox.style.height = "auto";
  const answer = addMessage("NUBI está pensando…", "assistant");
  const send = $("sendBtn");
  send.disabled = true;
  send.style.opacity = ".55";
  try {
    const reply = await askNubi(conversation, answer);
    answer.textContent = reply;
    conversation.push({role:"assistant",content:reply});
    saveHistory(value);
  } catch (error) {
    answer.textContent = "No he podido responder.\n\n" + error.message;
    const last = conversation[conversation.length-1];
    if (last && last.role === "user") conversation.pop();
  } finally {
    send.disabled = false;
    send.style.opacity = "1";
    messages.scrollTop = messages.scrollHeight;
  }
}
$("sendBtn").addEventListener("click", () => sendMessage());
promptBox.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
promptBox.addEventListener("input", () => { promptBox.style.height = "auto"; promptBox.style.height = Math.min(promptBox.scrollHeight,150) + "px"; });
document.querySelectorAll(".suggestion").forEach(btn => btn.addEventListener("click", () => sendMessage(btn.dataset.prompt)));
$("newChat").addEventListener("click", () => { messages.innerHTML = ""; welcome.style.display = ""; conversation = []; setView("chat"); });
function saveHistory(title) {
  const list = JSON.parse(localStorage.getItem("nubi-history") || "[]");
  list.unshift({title, date:Date.now()});
  localStorage.setItem("nubi-history", JSON.stringify(list.slice(0,12)));
  renderHistory();
}
function renderHistory() {
  const list = JSON.parse(localStorage.getItem("nubi-history") || "[]");
  const box = $("history");
  box.innerHTML = "";
  if (!list.length) { box.innerHTML = '<p class="empty-history">Tus conversaciones aparecerán aquí.</p>'; return; }
  list.forEach(item => { const el = document.createElement("button"); el.className = "history-entry"; el.textContent = item.title; el.title = item.title; el.addEventListener("click", () => { setView("chat"); sendMessage(item.title); }); box.appendChild(el); });
}
renderHistory();

$("attachBtn").addEventListener("click", () => $("hiddenFileInput").click());
$("hiddenFileInput").addEventListener("change", e => { if (e.target.files[0]) { setView("files"); processFile(e.target.files[0]); e.target.value = ""; } });
$("fileInput").addEventListener("change", e => { if (e.target.files[0]) processFile(e.target.files[0]); });
const drop = $("dropZone");
["dragenter","dragover"].forEach(type => drop.addEventListener(type,e=>{e.preventDefault();drop.style.borderColor="#a99aff";}));
["dragleave","drop"].forEach(type => drop.addEventListener(type,e=>{e.preventDefault();drop.style.borderColor="";}));
drop.addEventListener("drop", e => { const file=e.dataTransfer.files[0]; if(file) processFile(file); });
async function processFile(file) {
  $("fileResult").hidden = false;
  $("fileName").textContent = file.name;
  const out = $("fileContent");
  out.textContent = "Procesando archivo…";
  if (currentFileUrl) URL.revokeObjectURL(currentFileUrl);
  if (file.type.startsWith("image/")) {
    currentFileUrl = URL.createObjectURL(file);
    const img = document.createElement("img"); img.src = currentFileUrl; img.alt = "Vista previa de " + file.name;
    out.innerHTML = ""; out.appendChild(img);
    const info = document.createElement("p"); info.textContent = "Imagen cargada correctamente. Para describirla con IA será necesario conectar un modelo compatible con visión."; out.appendChild(info);
    return;
  }
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    if (!window.pdfjsLib) { out.textContent = "No se pudo cargar el lector PDF. Comprueba tu conexión a internet y vuelve a intentarlo."; return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({data}).promise;
      let full = "";
      for (let pageNo=1; pageNo<=Math.min(pdf.numPages,20); pageNo++) {
        const page = await pdf.getPage(pageNo);
        const content = await page.getTextContent();
        full += "\n--- Página " + pageNo + " ---\n" + content.items.map(x=>x.str).join(" ") + "\n";
      }
      out.textContent = full.trim() || "No se ha encontrado texto seleccionable. Puede ser un PDF escaneado.";
      if (pdf.numPages > 20) out.textContent += "\n\nSe han leído las primeras 20 páginas para mantener la aplicación rápida.";
    } catch(err) { out.textContent = "No se pudo leer este PDF. Puede estar protegido o dañado."; }
    return;
  }
  out.textContent = "Formato no compatible. Selecciona un PDF o una imagen.";
}
$("clearFile").addEventListener("click", () => { $("fileResult").hidden = true; $("fileInput").value = ""; $("fileContent").innerHTML = ""; if(currentFileUrl) URL.revokeObjectURL(currentFileUrl); currentFileUrl=null; });
$("imagePrepare").addEventListener("click", () => {
  const value = $("imagePrompt").value.trim();
  $("imageResult").textContent = value ? "Descripción preparada:\n" + value + "\n\nLa generación real de imágenes se activará al conectar un proveedor compatible." : "Escribe primero una descripción.";
});
$("codeSend").addEventListener("click", () => { const value=$("codePrompt").value.trim(); if(!value)return; setView("chat"); sendMessage("Ayúdame con este proyecto de programación: " + value); });