/* NUBI AI · Traductor de vídeo inglés → subtítulos españoles.
   Todo el procesamiento multimedia se ejecuta en el navegador. */
const $t = (id) => document.getElementById(id);
const fileInput = $t("translateFile");
let selectedVideo = null, running = false, cancelRequested = false, ffmpeg = null, transcriber = null, outputUrl = null, previewUrl = null, translationAbort = null;
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_SECONDS = 180;
const setStatus = (s) => { $t("translateStatus").textContent=s; $t("translateState").textContent=s; };
const setProgress = (p,s) => { $t("translateProgress").hidden=false; $t("translatePercent").textContent=Math.round(p)+"%"; $t("translateBar").style.width=Math.max(0,Math.min(100,p))+"%"; if(s)setStatus(s); };
function step(name){document.querySelectorAll("#translateSteps [data-step]").forEach(el=>{el.classList.toggle("active",el.dataset.step===name);if(["load","transcribe","translate","export"].indexOf(el.dataset.step)<["load","transcribe","translate","export"].indexOf(name))el.classList.add("done");});}
function resetSteps(){document.querySelectorAll("#translateSteps>div").forEach(el=>el.classList.remove("active","done"));}
function safeName(n){return n.replace(/[^\w.-]+/g,"_").replace(/\.(mp4|mov|webm)$/i,"")||"video_traducido";}
fileInput.addEventListener("change",()=>{
 const f=fileInput.files?.[0]; selectedVideo=null; $t("translateGo").disabled=true; $t("translateMeta").hidden=true; if(previewUrl)URL.revokeObjectURL(previewUrl); previewUrl=null;
 if(!f)return;
 if(!/^video\//.test(f.type)&&! /\.(mp4|mov|webm)$/i.test(f.name)){alert("Selecciona un vídeo MP4, MOV o WEBM.");fileInput.value="";return;}
 if(f.size>MAX_BYTES){alert("El vídeo supera 60 MB. Usa un clip más corto o comprimido para no bloquear Chrome.");fileInput.value="";return;}
 selectedVideo=f;$t("translateFileName").textContent=f.name;$t("translateMeta").hidden=false;
 $t("translateMeta").textContent=(f.size/1024/1024).toFixed(1)+" MB · "+f.type;
 $t("translateGo").disabled=false;$t("translateState").textContent="Vídeo listo";
 $t("translatePreviewBody").innerHTML="";const v=document.createElement("video");v.controls=true;previewUrl=URL.createObjectURL(f);v.src=previewUrl;$t("translatePreviewBody").append(v);
 $t("translateDownload").hidden=true;
});
async function loadTranscriber(){
 if(transcriber)return transcriber;
 const {pipeline,env}=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2");
 env.allowLocalModels=false;env.useBrowserCache=true;
 transcriber=await pipeline("automatic-speech-recognition","onnx-community/whisper-tiny.en",{dtype:"q8",progress_callback:p=>{if(p.status==="progress")setProgress(4+(p.progress||0)*.18,"Descargando modelo de voz…");}});
 return transcriber;
}
async function loadFFmpeg(){
 if(ffmpeg)return ffmpeg;
 const {FFmpeg}=await import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js");
 const {toBlobURL}=await import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js");
 ffmpeg=new FFmpeg();
 ffmpeg.on("progress",({progress})=>{if(running&&!cancelRequested)setProgress(72+Math.max(0,Math.min(1,progress))*26,"Preparando MP4…");});
 const base="https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";
 await ffmpeg.load({coreURL:await toBlobURL(base+"/ffmpeg-core.js","text/javascript"),wasmURL:base+"/ffmpeg-core.wasm"});
 return ffmpeg;
}
async function translateText(text){
 translationAbort=new AbortController();const timer=setTimeout(()=>translationAbort?.abort(),45000);
 let res;try{res=await fetch("https://text.pollinations.ai/openai",{method:"POST",headers:{"Content-Type":"application/json"},signal:translationAbort.signal,body:JSON.stringify({model:"openai",stream:false,temperature:0.1,messages:[{role:"system",content:"Traduce del inglés al español de España. Conserva el significado, nombres propios y tono. Devuelve solo la traducción, sin explicaciones."},{role:"user",content:text}],private:true})});}finally{clearTimeout(timer);translationAbort=null;}
 if(!res.ok)throw new Error("El servicio gratuito de traducción no responde ("+res.status+"). Inténtalo más tarde.");
 const data=await res.json();const out=data.choices?.[0]?.message?.content?.trim();if(!out)throw new Error("La IA no devolvió una traducción.");return out;
}
function timeSrt(s){const ms=Math.max(0,Math.round(s*1000)),h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),sec=Math.floor(ms%60000/1000),mil=ms%1000;return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(sec).padStart(2,"0")+","+String(mil).padStart(3,"0");}
function makeSrt(chunks){return chunks.map((c,i)=>{const start=c.timestamp?.[0]??0,end=c.timestamp?.[1]??start+3;return (i+1)+"\n"+timeSrt(start)+" --> "+timeSrt(Math.max(start+.3,end))+"\n"+String(c.text||"").trim()+"\n";}).join("\n");}
async function runTranslation(){
 if(running||!selectedVideo)return;
 running=true;cancelRequested=false;$t("translateGo").disabled=true;$t("translateCancel").hidden=false;$t("translateDownload").hidden=true;resetSteps();
 let audioUrl=null;
 try{
  setProgress(2,"Comprobando duración…");
  const probe=document.createElement("video");probe.preload="metadata";audioUrl=URL.createObjectURL(selectedVideo);probe.src=audioUrl;
  await new Promise((resolve,reject)=>{probe.onloadedmetadata=resolve;probe.onerror=()=>reject(new Error("No se puede leer este vídeo. Prueba con MP4 H.264."));});
  if(!Number.isFinite(probe.duration)||probe.duration>MAX_SECONDS)throw new Error("El vídeo dura más de 3 minutos. Usa un clip más corto para proteger la memoria del Chromebook.");
  step("load");setProgress(4,"Cargando IA de transcripción…");const asr=await loadTranscriber();if(cancelRequested)throw new Error("Proceso cancelado.");
  step("transcribe");setProgress(26,"Extrayendo audio del vídeo…");const ff=await loadFFmpeg();
  const ext=(selectedVideo.name.split(".").pop()||"mp4").toLowerCase();const input="source."+ext;
  await ff.writeFile(input,new Uint8Array(await selectedVideo.arrayBuffer()));
  await ff.exec(["-i",input,"-vn","-ac","1","-ar","16000","-c:a","pcm_s16le","audio.wav"]);
  if(cancelRequested)throw new Error("Proceso cancelado.");
  setProgress(31,"Transcribiendo el audio inglés…");
  const audio=await ff.readFile("audio.wav");
  const audioContext=new AudioContext({sampleRate:16000});let audioSamples;try{const decoded=await audioContext.decodeAudioData(audio.buffer.slice(audio.byteOffset,audio.byteOffset+audio.byteLength));audioSamples=new Float32Array(decoded.getChannelData(0));}finally{await audioContext.close();}const result=await asr(audioSamples,{sampling_rate:16000,chunk_length_s:25,stride_length_s:5,return_timestamps:true});
  const chunks=(result.chunks||[]).filter(c=>c.text?.trim());
  if(!chunks.length)throw new Error("No se ha detectado voz en inglés.");
  step("translate");const translated=[];
  for(let i=0;i<chunks.length;i++){if(cancelRequested)throw new Error("Proceso cancelado.");const original=chunks[i].text.trim();translated.push({...chunks[i],text:await translateText(original)});setProgress(34+(i+1)/chunks.length*35,"Traduciendo frase "+(i+1)+" de "+chunks.length+"…");}
  step("export");setProgress(72,"Creando archivo MP4 con subtítulos…");
  await ff.writeFile("subtitulos_es.srt",new TextEncoder().encode(makeSrt(translated)));
  await ff.exec(["-i",input,"-i","subtitulos_es.srt","-map","0:v:0","-map","0:a?","-map","1:0","-c:v","libx264","-preset","ultrafast","-crf","27","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-c:s","mov_text","-metadata:s:s:0","language=spa","-metadata:s:s:0","title=Español","-movflags","+faststart","-shortest","video_traducido.mp4"]);
  if(cancelRequested)throw new Error("Proceso cancelado.");
  const data=await ff.readFile("video_traducido.mp4");const blob=new Blob([data.buffer],{type:"video/mp4"});outputUrl=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=outputUrl;a.download=safeName(selectedVideo.name)+"_es.mp4";a.className="primary-button";a.textContent="↓ Descargar MP4 en español";
  const p=document.createElement("p");p.textContent="Listo. El MP4 conserva el audio original e incluye una pista de subtítulos en español.";
  $t("translateDownload").replaceChildren(p,a);$t("translateDownload").hidden=false;
  const preview=document.createElement("video");preview.controls=true;preview.src=outputUrl;$t("translatePreviewBody").replaceChildren(preview);
  setProgress(100,"Traducción terminada");$t("translateState").textContent="MP4 preparado";step("complete");
 }catch(err){console.error(err);setStatus(err.message||"No se pudo procesar el vídeo.");$t("translateState").textContent="Error";alert(err.message||"No se pudo procesar el vídeo.");}
 finally{running=false;$t("translateGo").disabled=!selectedVideo;$t("translateCancel").hidden=true;if(audioUrl)URL.revokeObjectURL(audioUrl);}
}
$t("translateGo").addEventListener("click",runTranslation);
$t("translateCancel").addEventListener("click",()=>{cancelRequested=true;if(translationAbort)translationAbort.abort();setStatus("Cancelando…");});
window.addEventListener("beforeunload",()=>{if(outputUrl)URL.revokeObjectURL(outputUrl);if(previewUrl)URL.revokeObjectURL(previewUrl);});
