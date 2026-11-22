/* NUBI AI · Doblaje de vídeo inglés → voz española, sin subtítulos.
   Todo en el navegador, optimizado para Chromebooks con poca RAM:
   - FFmpeg se carga como script clásico (los Workers de otro origen están bloqueados en módulos ES).
   - El vídeo se MONTA (WORKERFS) en vez de copiarse a memoria, y la pista de vídeo se COPIA sin recodificar.
   - Los modelos se cargan de uno en uno y se liberan al terminar cada fase. */
const $t = (id) => document.getElementById(id);
const fileInput = $t("translateFile");
const TF = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2";
const FF = "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd";
const FFU = "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/umd/index.js";
const FFCORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";

const LOW_RAM = (navigator.deviceMemory || 4) <= 4;
const MAX_BYTES = 150 * 1024 * 1024;
const MAX_SECONDS = 20 * 60;
const SR = 16000;

let selectedVideo = null, running = false, cancelRequested = false, ffmpeg = null, outputUrl = null, previewUrl = null, translationAbort = null;

const setStatus = (s) => { $t("translateStatus").textContent = s; $t("translateState").textContent = s; };
const setProgress = (p, s) => { $t("translateProgress").hidden = false; $t("translatePercent").textContent = Math.round(p) + "%"; $t("translateBar").style.width = Math.max(0, Math.min(100, p)) + "%"; if (s) setStatus(s); };
function step(name) { const order = ["load", "transcribe", "translate", "voice", "export"]; document.querySelectorAll("#translateSteps [data-step]").forEach((el) => { el.classList.toggle("active", el.dataset.step === name); if (name === "complete" || order.indexOf(el.dataset.step) < order.indexOf(name)) el.classList.add("done"); }); }
function resetSteps() { document.querySelectorAll("#translateSteps>div").forEach((el) => el.classList.remove("active", "done")); }
function safeName(n) { return n.replace(/[^\w.-]+/g, "_").replace(/\.(mp4|mov|webm|m4v)$/i, "") || "video_traducido"; }
const checkCancel = () => { if (cancelRequested) throw new Error("Proceso cancelado."); };
const tick = () => new Promise((r) => setTimeout(r, 0)); // deja respirar a la interfaz

function pickVideo(f) {
  selectedVideo = null; $t("translateGo").disabled = true; $t("translateMeta").hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null;
  if (!f) return;
  if (!/^video\//.test(f.type) && !/\.(mp4|mov|webm|m4v)$/i.test(f.name)) { alert("Selecciona un vídeo MP4, MOV o WEBM."); fileInput.value = ""; return; }
  if (f.size > MAX_BYTES) { alert("El vídeo supera 150 MB. Comprímelo o baja su resolución para que Chrome no se quede sin memoria."); fileInput.value = ""; return; }
  if (LOW_RAM && f.size > 80 * 1024 * 1024 && !confirm("Este vídeo pesa " + (f.size / 1048576).toFixed(0) + " MB y tu equipo tiene poca RAM. Puede fallar. ¿Continuar igualmente?")) { fileInput.value = ""; return; }
  selectedVideo = f; $t("translateFileHint").textContent = f.name; $t("translateMeta").hidden = false;
  $t("translateMeta").textContent = (f.size / 1048576).toFixed(1) + " MB · " + (f.type || "vídeo");
  $t("translateGo").disabled = false; $t("translateState").textContent = "Vídeo listo";
  $t("translatePreviewBody").innerHTML = "";
  const v = document.createElement("video"); v.controls = true; v.preload = "metadata"; v.muted = false; previewUrl = URL.createObjectURL(f); v.src = previewUrl;
  $t("translatePreviewBody").append(v); $t("translateDownload").hidden = true;
}
fileInput.addEventListener("change", () => pickVideo(fileInput.files?.[0]));
// Soltar el vídeo directamente sobre el panel
const dropTarget = $t("translateView");
["dragover", "drop"].forEach((ev) => dropTarget.addEventListener(ev, (e) => {
  if (!e.dataTransfer?.types?.includes("Files")) return;
  e.preventDefault();
  if (ev === "drop" && !running) { const f = e.dataTransfer.files[0]; if (f) { try { const dt = new DataTransfer(); dt.items.add(f); fileInput.files = dt.files; } catch (_) {} pickVideo(f); } }
}));

/* ---------- carga de componentes ---------- */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-nubi-src="' + src + '"]')) return resolve();
    const s = document.createElement("script"); s.src = src; s.dataset.nubiSrc = src; s.onload = resolve;
    s.onerror = () => reject(new Error("No se pudo descargar un componente (" + src.split("/").slice(-3, -2) + "). Revisa tu conexión."));
    document.head.append(s);
  });
}
async function toBlobURL(url, type) { const r = await fetch(url); if (!r.ok) throw new Error("No se pudo descargar " + url.split("/").pop()); return URL.createObjectURL(new Blob([await r.arrayBuffer()], { type })); }
async function loadFFmpeg() {
  if (ffmpeg) return ffmpeg;
  await loadScript(FF + "/ffmpeg.js");
  const { FFmpeg } = window.FFmpegWrapper || {};
  if (!FFmpeg) throw new Error("FFmpeg no se pudo inicializar.");
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(FFCORE + "/ffmpeg-core.js", "text/javascript"),
    toBlobURL(FFCORE + "/ffmpeg-core.wasm", "application/wasm"),
  ]);
  const make = () => { const f = new FFmpeg(); f.on("progress", ({ progress }) => { if (running && !cancelRequested && f._phase === "mux") setProgress(88 + Math.max(0, Math.min(1, progress)) * 11, "Creando el vídeo final…"); }); return f; };
  let ff = make();
  try { // el Worker debe salir de un blob del mismo origen; Chrome bloquea los de otro dominio
    const classWorkerURL = await toBlobURL(FF + "/814.ffmpeg.js", "text/javascript");
    await ff.load({ coreURL, wasmURL, classWorkerURL });
  } catch (e) { console.warn("Carga con worker en blob falló, reintentando:", e); try { ff.terminate(); } catch (_) {} ff = make(); await ff.load({ coreURL, wasmURL }); }
  ffmpeg = ff; return ff;
}
async function stopFFmpeg() { const ff = ffmpeg; ffmpeg = null; if (ff) { try { ff.terminate(); } catch (_) {} } } // libera el heap de WebAssembly (nunca se encoge solo)

let tfMod = null;
async function loadPipeline(task, model, opts, from, span, label) {
  tfMod = tfMod || (await import(TF)); tfMod.env.allowLocalModels = false; tfMod.env.useBrowserCache = true;
  return tfMod.pipeline(task, model, { ...opts, progress_callback: (p) => { if (p.status === "progress") setProgress(from + (p.progress || 0) / 100 * span, label); } });
}
const freeModel = async (m) => { try { await m?.dispose?.(); } catch (_) {} };

/* ---------- traducción por lotes (menos peticiones, más contexto, más fiable) ---------- */
async function translateRequest(system, user) {
  for (let attempt = 0; attempt < 3; attempt++) {
    checkCancel();
    translationAbort = new AbortController(); const timer = setTimeout(() => translationAbort?.abort(), 45000);
    try {
      const res = await fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json" }, signal: translationAbort.signal,
        body: JSON.stringify({ model: "openai", stream: false, temperature: 0.1, messages: [{ role: "system", content: system }, { role: "user", content: user }], private: true }) });
      if (res.ok) { const out = (await res.json()).choices?.[0]?.message?.content?.trim(); if (out) return out; }
      else if (res.status !== 429 && res.status < 500) throw new Error("El servicio gratuito de traducción respondió " + res.status + ".");
    } catch (e) { if (cancelRequested) throw new Error("Proceso cancelado."); if (attempt === 2) throw new Error(e.name === "AbortError" ? "La traducción tardó demasiado. Inténtalo más tarde." : (e.message || "No se pudo traducir.")); }
    finally { clearTimeout(timer); translationAbort = null; }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error("El servicio gratuito de traducción no responde. Inténtalo más tarde.");
}
async function translateBatch(texts) {
  const sys = "Traduce del inglés al español de España, con tono natural para ser hablado en un doblaje. Conserva significado y nombres propios. Recibirás un array JSON de frases y debes devolver SOLO un array JSON con el mismo número de frases traducidas, en el mismo orden, sin explicaciones ni bloques de código.";
  try {
    const raw = (await translateRequest(sys, JSON.stringify(texts))).replace(/^```(?:json)?|```$/gim, "").trim();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length === texts.length && arr.every((x) => typeof x === "string" && x.trim())) return arr;
  } catch (e) { if (cancelRequested) throw e; }
  const out = []; // respaldo: frase a frase
  for (const t of texts) out.push(await translateRequest("Traduce del inglés al español de España. Devuelve solo la traducción.", t));
  return out;
}

/* ---------- proceso principal ---------- */
async function runTranslation() {
  if (running || !selectedVideo) return;
  running = true; cancelRequested = false; $t("translateGo").disabled = true; $t("translateCancel").hidden = false; $t("translateDownload").hidden = true; resetSteps();
  let asr = null, tts = null, mounted = false;
  const ext = (selectedVideo.name.split(".").pop() || "mp4").toLowerCase();
  const input = "source." + (["mp4", "mov", "webm", "m4v"].includes(ext) ? ext : "mp4");
  try {
    step("load"); setProgress(2, "Preparando FFmpeg…");
    const ff = await loadFFmpeg(); checkCancel();

    // 1) El vídeo se monta sin copiarlo a memoria; si el navegador no lo permite, se escribe en el sistema virtual.
    let src = "/in/" + selectedVideo.name.replace(/[^\w.\-]/g, "_");
    try {
      await ff.createDir("/in");
      await ff.mount("WORKERFS", { files: [new File([selectedVideo], src.slice(4), { type: selectedVideo.type })] }, "/in");
      mounted = true;
    } catch (_) { src = input; await ff.writeFile(src, new Uint8Array(await selectedVideo.arrayBuffer())); }

    // 2) Audio en bruto a 16 kHz mono (float32): sin AudioContext ni conversiones intermedias.
    step("transcribe"); setProgress(8, "Extrayendo el audio…");
    ff._phase = "audio";
    const code = await ff.exec(["-i", src, "-vn", "-ac", "1", "-ar", String(SR), "-f", "f32le", "audio.raw"]);
    checkCancel();
    if (code !== 0) throw new Error("No se pudo leer el audio de este vídeo. Prueba con un MP4 (H.264 + AAC).");
    const rawAudio = await ff.readFile("audio.raw"); await ff.deleteFile("audio.raw").catch(() => {});
    let samples = new Float32Array(rawAudio.buffer.slice(rawAudio.byteOffset, rawAudio.byteOffset + rawAudio.byteLength));
    const duration = samples.length / SR;
    if (!duration) throw new Error("El vídeo no tiene pista de audio.");
    if (duration > MAX_SECONDS) throw new Error("El vídeo supera el máximo de 20 minutos. Prueba con un clip más corto.");

    // 3) Transcripción; el modelo se descarta al acabar para dejar RAM a la voz.
    setProgress(12, "Cargando IA para reconocer el inglés…");
    asr = await loadPipeline("automatic-speech-recognition", "onnx-community/whisper-tiny.en", { dtype: "q8" }, 12, 10, "Descargando modelo de voz…"); checkCancel();
    setProgress(24, "Reconociendo lo que se dice…"); await tick();
    const result = await asr(samples, { sampling_rate: SR, chunk_length_s: 25, stride_length_s: 5, return_timestamps: true });
    samples = null; await freeModel(asr); asr = null; checkCancel();
    const chunks = (result.chunks || []).filter((c) => c.text?.trim()).map((c) => ({ text: c.text.trim(), start: c.timestamp?.[0], end: c.timestamp?.[1] }));
    if (!chunks.length) throw new Error("No se ha detectado voz en inglés.");

    // 4) Traducción en lotes de 8 frases.
    step("translate"); const translated = [];
    for (let i = 0; i < chunks.length; i += 8) {
      const part = chunks.slice(i, i + 8);
      translated.push(...(await translateBatch(part.map((c) => c.text))));
      setProgress(35 + Math.min(1, (i + part.length) / chunks.length) * 22, "Traduciendo frase " + Math.min(i + part.length, chunks.length) + " de " + chunks.length + "…");
    }

    // 5) Voz española; las frases se colocan en su momento y, si una se alarga, empuja a la siguiente (sin pisarse).
    step("voice"); setProgress(58, "Preparando voz española…");
    tts = await loadPipeline("text-to-speech", "Xenova/mms-tts-spa", {}, 58, 8, "Descargando voz española…");
    const placed = []; let cursor = 0;
    for (let i = 0; i < translated.length; i++) {
      checkCancel();
      const spoken = await tts(translated[i]);
      if (!spoken?.audio?.length) throw new Error("El modelo de voz no ha generado audio.");
      let s = spoken.sampling_rate === SR ? spoken.audio : resampleAudio(spoken.audio, spoken.sampling_rate, SR);
      const start = Math.max(Number.isFinite(chunks[i].start) ? chunks[i].start : cursor, cursor);
      const nextStart = i + 1 < chunks.length && Number.isFinite(chunks[i + 1].start) ? chunks[i + 1].start : duration;
      const room = Math.max(0.3, nextStart - start), len = s.length / SR;
      if (len > room) s = resampleAudio(s, Math.round(SR * Math.min(len / room, 1.4)), SR); // acelera como mucho x1,4 para que suene natural
      placed.push({ at: Math.round(start * SR), s }); cursor = start + s.length / SR + 0.05;
      setProgress(66 + (i + 1) / translated.length * 16, "Generando doblaje " + (i + 1) + " de " + translated.length + "…");
      if (i % 5 === 4) await tick();
    }
    await freeModel(tts); tts = null;
    const dubbed = new Float32Array(Math.ceil(Math.max(duration, cursor) * SR) + SR);
    for (const p of placed) dubbed.set(p.s.subarray(0, Math.max(0, Math.min(p.s.length, dubbed.length - p.at))), p.at);
    placed.length = 0;

    // 6) Montaje: se copia el vídeo tal cual (rápido y sin gastar RAM); solo se codifica el audio nuevo.
    step("export"); setProgress(84, "Creando el vídeo con voz española…"); ff._phase = "mux";
    await ff.writeFile("doblaje.raw", new Uint8Array(dubbed.buffer));
    const isWebm = ext === "webm"; const outName = isWebm ? "doblado.webm" : "doblado.mp4";
    const audioArgs = isWebm ? ["-c:a", "libopus", "-b:a", "96k"] : ["-c:a", "aac", "-b:a", "128k"];
    const base = ["-i", src, "-f", "f32le", "-ar", String(SR), "-ac", "1", "-i", "doblaje.raw", "-map", "0:v:0", "-map", "1:a:0"];
    const tail = [...audioArgs, "-af", "apad", "-shortest", ...(isWebm ? [] : ["-movflags", "+faststart"]), outName];
    let rc = await ff.exec([...base, "-c:v", "copy", ...tail]); checkCancel();
    if (rc !== 0) { // respaldo: recodificar a 720p como máximo (más lento)
      await ff.deleteFile(outName).catch(() => {}); setProgress(88, "Recodificando el vídeo (más lento)…");
      rc = await ff.exec([...base, "-c:v", isWebm ? "libvpx" : "libx264", ...(isWebm ? ["-b:v", "1M", "-deadline", "realtime"] : ["-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p"]), "-vf", "scale=-2:'min(720,ih)'", ...tail]); checkCancel();
    }
    if (rc !== 0) throw new Error("No se pudo crear el vídeo final. Prueba con un MP4 H.264 más pequeño.");
    await ff.deleteFile("doblaje.raw").catch(() => {});
    const data = await ff.readFile(outName); await ff.deleteFile(outName).catch(() => {});
    const blob = new Blob([data.buffer], { type: isWebm ? "video/webm" : "video/mp4" });
    if (outputUrl) URL.revokeObjectURL(outputUrl); outputUrl = URL.createObjectURL(blob);

    const a = document.createElement("a"); a.href = outputUrl; a.download = safeName(selectedVideo.name) + "_doblado_es." + (isWebm ? "webm" : "mp4"); a.className = "primary-button"; a.textContent = "↓ Descargar vídeo doblado al español";
    const p = document.createElement("p"); p.textContent = "Listo. El audio inglés se ha sustituido por una voz sintética en español. El vídeo no lleva subtítulos.";
    $t("translateDownload").replaceChildren(p, a); $t("translateDownload").hidden = false;
    const preview = document.createElement("video"); preview.controls = true; preview.src = outputUrl; $t("translatePreviewBody").replaceChildren(preview);
    setProgress(100, "Doblaje terminado"); $t("translateState").textContent = "Vídeo doblado"; step("complete");
  } catch (err) {
    console.error(err);
    const cancelled = cancelRequested || err.name === "AbortError" || /cancelado/i.test(err.message || "");
    setStatus(cancelled ? "Proceso cancelado." : (err.message || "No se pudo doblar el vídeo."));
    $t("translateState").textContent = cancelled ? "Cancelado" : "Error";
    if (!cancelled) alert(err.message || "No se pudo doblar el vídeo.");
  } finally {
    await freeModel(asr); await freeModel(tts);
    try { if (ffmpeg && mounted) await ffmpeg.unmount("/in"); } catch (_) {}
    await stopFFmpeg(); // libera toda la memoria de FFmpeg; la próxima vez se recarga desde la caché
    running = false; $t("translateGo").disabled = !selectedVideo; $t("translateCancel").hidden = true;
  }
}
function resampleAudio(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const length = Math.round(input.length * toRate / fromRate), out = new Float32Array(length), ratio = fromRate / toRate;
  for (let i = 0; i < length; i++) { const pos = i * ratio, left = Math.floor(pos), right = Math.min(left + 1, input.length - 1), mix = pos - left; out[i] = input[left] * (1 - mix) + input[right] * mix; }
  return out;
}
$t("translateGo").addEventListener("click", runTranslation);
$t("translateCancel").addEventListener("click", () => { cancelRequested = true; if (translationAbort) translationAbort.abort(); setStatus("Cancelando…"); stopFFmpeg(); });
window.addEventListener("beforeunload", () => { if (outputUrl) URL.revokeObjectURL(outputUrl); if (previewUrl) URL.revokeObjectURL(previewUrl); });
