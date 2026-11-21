/* NUBI AI · Doblaje de vídeo inglés → voz española, sin subtítulos.
   Transcripción, traducción, síntesis de voz y exportación en el navegador. */
const $t = (id) => document.getElementById(id);
const fileInput = $t("translateFile");

let selectedVideo = null, running = false, cancelRequested = false, ffmpeg = null, transcriber = null, synthesizer = null, outputUrl = null, previewUrl = null, translationAbort = null;
const MAX_BYTES = 150 * 1024 * 1024;
const MAX_SECONDS = 20 * 60;
const setStatus = (s) => { $t("translateStatus").textContent=s; $t("translateState").textContent=s; };
const setProgress = (p,s) => { $t("translateProgress").hidden=false; $t("translatePercent").textContent=Math.round(p)+"%"; $t("translateBar").style.width=Math.max(0,Math.min(100,p))+"%"; if(s)setStatus(s); };
function step(name){const order=["load","transcribe","translate","voice","export"];document.querySelectorAll("#translateSteps [data-step]").forEach(el=>{el.classList.toggle("active",el.dataset.step===name);if(name==="complete"||order.indexOf(el.dataset.step)<order.indexOf(name))el.classList.add("done");});}
function resetSteps(){document.querySelectorAll("#translateSteps>div").forEach(el=>el.classList.remove("active","done"));}
function safeName(n){return n.replace(/[^\w.-]+/g,"_").replace(/\.(mp4|mov|webm)$/i,"")||"video_traducido";}
fileInput.addEventListener("change",()=>{
 const f=fileInput.files?.[0]; selectedVideo=null; $t("translateGo").disabled=true; $t("translateMeta").hidden=true; if(previewUrl)URL.revokeObjectURL(previewUrl); previewUrl=null;
 if(!f)return;
 if(!/^video\//.test(f.type)&&! /\.(mp4|mov|webm)$/i.test(f.name)){alert("Selecciona un vídeo MP4, MOV o WEBM.");fileInput.value="";return;}
 if(f.size>MAX_BYTES){alert("El vídeo supera 150 MB. Comprímelo o reduce su resolución para que Chrome no se quede sin memoria.");fileInput.value="";return;}
 selectedVideo=f;$t("translateFileHint").textContent=f.name;$t("translateMeta").hidden=false;
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
async function loadSynthesizer(){
 if(synthesizer)return synthesizer;
 const {pipeline,env}=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2");
 env.allowLocalModels=false;env.useBrowserCache=true;
 synthesizer=await pipeline("text-to-speech","Xenova/mms-tts-spa",{progress_callback:p=>{if(p.status==="progress")setProgress(34+(p.progress||0)*.12,"Descargando voz española…");}});
 return synthesizer;
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
async function runTranslation(){
 if(running||!selectedVideo)return;
 running=true;cancelRequested=false;$t("translateGo").disabled=true;$t("translateCancel").hidden=false;$t("translateDownload").hidden=true;resetSteps();
 let audioUrl=null;
 try{
  setProgress(2,"Comprobando duración…");
  const probe=document.createElement("video");probe.preload="metadata";audioUrl=URL.createObjectURL(selectedVideo);probe.src=audioUrl;
  await new Promise((resolve,reject)=>{probe.onloadedmetadata=resolve;probe.onerror=()=>reject(new Error("No se puede leer este vídeo. Prueba con MP4 H.264."));});
  if(!Number.isFinite(probe.duration)||probe.duration>MAX_SECONDS)throw new Error("El vídeo supera el máximo de 20 minutos. Si tu Chromebook tiene poca memoria, prueba primero con vídeos cortos.");
  step("load");setProgress(4,"Cargando IA para reconocer el inglés…");const asr=await loadTranscriber();if(cancelRequested)throw new Error("Proceso cancelado.");
  step("transcribe");setProgress(25,"Extrayendo audio inglés…");const ff=await loadFFmpeg();
  const ext=(selectedVideo.name.split(".").pop()||"mp4").toLowerCase();const input="source."+ext;
  await ff.writeFile(input,new Uint8Array(await selectedVideo.arrayBuffer()));
  await ff.exec(["-i",input,"-vn","-ac","1","-ar","16000","-c:a","pcm_s16le","audio.wav"]);
  if(cancelRequested)throw new Error("Proceso cancelado.");
  setProgress(30,"Reconociendo lo que se dice…");
  const audio=await ff.readFile("audio.wav");
  const audioContext=new AudioContext({sampleRate:16000});let audioSamples;try{const decoded=await audioContext.decodeAudioData(audio.buffer.slice(audio.byteOffset,audio.byteOffset+audio.byteLength));audioSamples=new Float32Array(decoded.getChannelData(0));}finally{await audioContext.close();}
  const result=await asr(audioSamples,{sampling_rate:16000,chunk_length_s:25,stride_length_s:5,return_timestamps:true});
  const chunks=(result.chunks||[]).filter(c=>c.text?.trim());
  if(!chunks.length)throw new Error("No se ha detectado voz en inglés.");
  step("translate");const translated=[];
  for(let i=0;i<chunks.length;i++){if(cancelRequested)throw new Error("Proceso cancelado.");translated.push(await translateText(chunks[i].text.trim()));setProgress(35+(i+1)/chunks.length*25,"Traduciendo frase "+(i+1)+" de "+chunks.length+"…");}
  if(cancelRequested)throw new Error("Proceso cancelado.");
  step("voice");setProgress(61,"Preparando voz española…");const tts=await loadSynthesizer();
  const dubbed=new Float32Array(Math.ceil((probe.duration+1)*16000));let fallbackCursor=0;
  for(let i=0;i<translated.length;i++){
   if(cancelRequested)throw new Error("Proceso cancelado.");
   const spoken=await tts(translated[i]);
   if(!spoken?.audio?.length)throw new Error("El modelo de voz no ha generado audio.");
   let samples=spoken.sampling_rate===16000?spoken.audio:resampleAudio(spoken.audio,spoken.sampling_rate,16000);
   const rawStart=chunks[i].timestamp?.[0];const startSec=Number.isFinite(rawStart)?rawStart:fallbackCursor;
   const rawNext=i+1<chunks.length?chunks[i+1].timestamp?.[0]:probe.duration;const nextStart=Number.isFinite(rawNext)?rawNext:probe.duration;
   const start=Math.max(0,Math.round(startSec*16000));
   const available=Math.max(0,Math.min(dubbed.length-start,Math.round((nextStart-startSec)*16000)));
   if(available>0&&samples.length>available)samples=resampleAudio(samples,Math.round(16000*samples.length/available),16000);
   const count=Math.min(samples.length,dubbed.length-start);
   if(count>0)for(let j=0;j<count;j++)dubbed[start+j]=samples[j];
   fallbackCursor=Math.max(startSec+samples.length/16000,nextStart);
   setProgress(63+(i+1)/translated.length*20,"Generando doblaje "+(i+1)+" de "+translated.length+"…");
  }
  step("export");setProgress(85,"Creando MP4 con voz española…");
  await ff.writeFile("doblaje.raw",new Uint8Array(dubbed.buffer));
  await ff.exec(["-f","f32le","-ar","16000","-ac","1","-i","doblaje.raw","-c:a","pcm_s16le","doblaje.wav"]);
  await ff.exec(["-i",input,"-i","doblaje.wav","-map","0:v:0","-map","1:a:0","-c:v","libx264","-preset","ultrafast","-crf","27","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-af","apad","-shortest","-movflags","+faststart","video_doblado_es.mp4"]);
  if(cancelRequested)throw new Error("Proceso cancelado.");
  const data=await ff.readFile("video_doblado_es.mp4");const blob=new Blob([data.buffer],{type:"video/mp4"});if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=outputUrl;a.download=safeName(selectedVideo.name)+"_doblado_es.mp4";a.className="primary-button";a.textContent="↓ Descargar MP4 doblado al español";
  const p=document.createElement("p");p.textContent="Listo. El audio inglés se ha sustituido por una voz sintética en español. El vídeo no lleva subtítulos.";
  $t("translateDownload").replaceChildren(p,a);$t("translateDownload").hidden=false;
  const preview=document.createElement("video");preview.controls=true;preview.src=outputUrl;$t("translatePreviewBody").replaceChildren(preview);
  setProgress(100,"Doblaje terminado");$t("translateState").textContent="MP4 doblado";step("complete");
 }catch(err){console.error(err);setStatus(err.name==="AbortError"?"Proceso cancelado.":(err.message||"No se pudo doblar el vídeo."));$t("translateState").textContent="Error";if(err.name!=="AbortError")alert(err.message||"No se pudo doblar el vídeo.");}
 finally{running=false;$t("translateGo").disabled=!selectedVideo;$t("translateCancel").hidden=true;if(audioUrl)URL.revokeObjectURL(audioUrl);}
}
function resampleAudio(input,fromRate,toRate){
 if(fromRate===toRate)return input;
 const length=Math.round(input.length*toRate/fromRate),out=new Float32Array(length),ratio=fromRate/toRate;
 for(let i=0;i<length;i++){const pos=i*ratio,left=Math.floor(pos),right=Math.min(left+1,input.length-1),mix=pos-left;out[i]=input[left]*(1-mix)+input[right]*mix;}
 return out;
}
$t("translateGo").addEventListener("click",runTranslation);
$t("translateCancel").addEventListener("click",()=>{cancelRequested=true;if(translationAbort)translationAbort.abort();setStatus("Cancelando…");});
window.addEventListener("beforeunload",()=>{if(outputUrl)URL.revokeObjectURL(outputUrl);if(previewUrl)URL.revokeObjectURL(previewUrl);});
