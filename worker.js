const ALLOWED_ORIGIN = "https://anthhdd.github.io";
const SYSTEM_INSTRUCTION = `Eres NUBI, un asistente de IA útil, claro, amable y competente. Responde en el idioma del usuario, normalmente español. Explica de forma sencilla cuando el usuario lo necesite. Ayuda con programación, estudio, creatividad y análisis. No inventes datos ni afirmes que has ejecutado acciones que no has realizado. Si no sabes algo, dilo claramente. Para código, entrega soluciones completas y explica dónde colocarlas. Mantén un tono natural y directo.`;
function cors(origin) { return {"Access-Control-Allow-Origin":origin===ALLOWED_ORIGIN?origin:ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"}; }
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});}
export default {
 async fetch(request,env){
  const origin=request.headers.get("Origin")||"";
  const headers=cors(origin);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="POST")return json({error:"Usa POST para enviar mensajes."},405,headers);
  if(origin!==ALLOWED_ORIGIN)return json({error:"Origen no autorizado."},403,headers);
  if(!env.GEMINI_API_KEY)return json({error:"Falta configurar GEMINI_API_KEY en los secretos de Cloudflare."},503,headers);
  let body;try{body=await request.json();}catch{return json({error:"El cuerpo de la petición no es JSON válido."},400,headers);}
  if(!Array.isArray(body.messages)||body.messages.length===0||body.messages.length>16)return json({error:"Envía entre 1 y 16 mensajes."},400,headers);
  const contents=[];let total=0;
  for(const item of body.messages){
   if(!item||!["user","assistant"].includes(item.role)||typeof item.content!=="string")continue;
   const content=item.content.trim();if(!content)continue;total+=content.length;
   if(content.length>10000||total>24000)return json({error:"El mensaje es demasiado largo. Divide el contenido en partes."},413,headers);
   contents.push({role:item.role==="assistant"?"model":"user",parts:[{text:content}]});
  }
  if(!contents.length||contents[contents.length-1].role!=="user")return json({error:"El último mensaje debe ser del usuario."},400,headers);
  const model=env.GEMINI_MODEL||"gemini-2.5-flash";
  const endpoint="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+encodeURIComponent(env.GEMINI_API_KEY);
  let upstream;try{upstream=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM_INSTRUCTION}]},contents,generationConfig:{temperature:0.7,maxOutputTokens:2048}})});}catch{return json({error:"No se pudo contactar con el proveedor de IA. Inténtalo de nuevo."},502,headers);}
  const result=await upstream.json().catch(()=>({}));
  if(!upstream.ok)return json({error:result?.error?.message||"El proveedor de IA ha rechazado la petición."},upstream.status===429?429:502,headers);
  const reply=(result.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("").trim();
  if(!reply)return json({error:"El modelo no ha generado texto. Prueba con otro mensaje."},502,headers);
  return json({reply,model},200,headers);
 }
};