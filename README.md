# NUBI AI

Chat, generador de imágenes y constructor de webs. **Sin API key, sin backend.** Funciona con solo subir estos archivos a GitHub Pages.

## Qué hace
- **Chat rápido** con respuestas en directo, Markdown, tablas y bloques de código con botón de copiar. Historial real de conversaciones (se guarda en tu navegador).
- **Crear imágenes**: estilos (realista, anime, pixel art, 3D, óleo, logo), formatos y galería. Usa Pollinations cuando está disponible; si el proveedor aplica límites o falla, NUBI intenta una ilustración SVG de respaldo. El respaldo vectorial no equivale a una imagen fotorrealista.
- **Webs y apps**: constructor reforzado con instrucciones de diseño de producto, UX/UI, accesibilidad, responsive y funcionalidad real. Describe lo que quieres, mira la vista previa en vivo, pide cambios, cambia a vista móvil/tablet, copia o descarga el `.html`. También desde el chat: «crea una web de…».
- **Documentos**: lee PDF/TXT, extrae texto de imágenes (OCR) y permite preguntar sobre ellos.

## Novedades v3
- **Fotos en el chat:** adjunta, pega (Ctrl+V) o arrastra imágenes y NUBI las analiza (modo ☁ Nube). En Webs puedes subir una imagen de referencia para replicar un diseño.
- **Vídeos:** la IA programa una animación (Canvas) y la grabas y descargas como .webm/.mp4, sin marca de agua. Son gráficos en movimiento, no vídeo fotorrealista.
- **Más precisión:** razonamiento paso a paso en el prompt y refuerzo con Wikipedia en preguntas de datos.
- **Clave opcional de Pollinations** (⚙ Configuración) para quitar la marca de agua de las imágenes. El modo SVG nunca la lleva.

## Doblaje de vídeos gratis
- Nueva categoría **Traducir vídeos**: acepta MP4, MOV y WEBM (hasta 150 MB y 20 minutos).
- Whisper Tiny reconoce el diálogo inglés en el navegador; la traducción de texto usa el servicio gratuito de Pollinations.
- El modelo **MMS-TTS español** genera una voz sintética en español en el navegador. FFmpeg WebAssembly sustituye la pista de audio original y exporta un MP4 sin subtítulos.
- El vídeo no se sube: transcripción, voz y exportación se hacen en el dispositivo. La traducción sí requiere internet y el servicio gratuito puede tener límites o estar temporalmente caído.
- El doblaje usa una voz sintética única, no imita la voz de las personas del vídeo. Los tiempos se aproximan a los segmentos detectados y puede haber desfases.
- La primera vez se descargan modelos y componentes; empieza con clips cortos para evitar agotar la memoria de Chrome.
## Novedades v5 · menos RAM y más listo
- **RAM:** la IA local se descarga sola de la memoria tras 2 min sin usarla; SD-Turbo se libera 30 s después de cada imagen; los modelos locales ya no se cargan al elegirlos sino al enviar el primer mensaje; ventana de contexto reducida (2048 tokens con ≤4 GB de RAM) y modelo 3B oculto en equipos de poca memoria.
- **Subir vídeos / doblaje:** FFmpeg se carga ahora con Worker en blob (antes Chrome lo bloqueaba), el vídeo se monta sin copiarlo a memoria, la pista de vídeo se copia sin recodificar y la transcripción, la traducción y la voz se ejecutan de una en una liberando cada modelo. Traducción por lotes con reintentos y voz que no se pisa. También puedes arrastrar el vídeo a la pestaña.
- **Más listo:** la nube prueba un modelo mayor y cae al estándar si falla; prompt compacto para modelos locales; temperatura según la tarea (código/cálculo más preciso, creatividad más libre); más historial en la nube; búsquedas web solo cuando las pides o se necesita información actual (antes saltaban con cualquier «?»).
- **Almacenamiento:** el historial guarda menos imágenes y reintenta sin ellas si el navegador se queda sin espacio.

## Motores de IA (selector arriba a la derecha)
| Modo | Cómo funciona | Pros / contras |
|---|---|---|
| ☁ Nube rápida (por defecto) | Servicio gratuito Pollinations, sin clave | Muy rápido y más listo. Tus mensajes salen a ese servicio. |
| ⚡ Local ligero | Qwen2.5 0.5B en tu navegador (WebGPU) | Privado, descarga ~0,3 GB. Menos potente. |
| 🧠 Local avanzado | Qwen2.5 1.5B en tu navegador (WebGPU) | Privado, descarga ~1 GB. Más lento. |

Si la nube falla y tu navegador tiene WebGPU, NUBI cambia sola a la IA local. Las imágenes usan Pollinations; el proveedor puede limitar temporalmente las solicitudes gratuitas (por ejemplo, una imagen cada cierto intervalo). NUBI no puede eliminar los límites del proveedor. Si falla, intenta un SVG de respaldo; este es vectorial y más sencillo, no una generación fotográfica real.

## Búsqueda web v4
- Nueva sección **Buscar en Internet** en el menú lateral.
- Busca páginas públicas con DuckDuckGo y vídeos de YouTube; abre resultados en una pestaña nueva.
- Permite enviar el tema y los resultados visibles al chat para que NUBI los explique.
- La búsqueda usa un servicio proxy externo (Jina Reader), por lo que puede fallar, aplicar límites o no indexar algunas páginas. No equivale a acceso directo a todas las webs.
- La interfaz ya no impone un máximo fijo de imágenes adjuntas ni de elementos en la galería. El navegador, el almacenamiento local, el tamaño de la petición y el proveedor de IA siguen teniendo límites técnicos; el modelo recibe un máximo práctico de 20 imágenes por mensaje.

## Publicar
Sube `index.html`, `app.js`, `styles.css`, `README.md` y `.nojekyll` a tu repo y activa **Settings → Pages → Deploy from a branch → main / (root)**. Borra `worker.js` si aún existe.

## Límites
Son servicios gratuitos: pueden ir lentos, tener cuotas o caerse. Ninguna IA gratuita «lo sabe todo». No envíes datos privados en modo nube.


**Aviso para vídeos largos:** el límite máximo es 20 minutos y 150 MB. El doblaje se procesa en el navegador y puede consumir mucha memoria y tardar bastante, especialmente en Chromebooks. Para evitar cierres, se recomienda empezar con clips cortos y usar vídeos comprimidos de baja resolución. No se garantiza que todos los dispositivos puedan procesar 20 minutos.
