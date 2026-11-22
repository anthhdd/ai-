# NUBI AI

Chat, generador de imágenes y constructor de webs. **Sin API key, sin backend.** Funciona con solo subir estos archivos a GitHub Pages.

## Qué hace
- **Chat rápido** con respuestas en directo, Markdown, tablas y bloques de código con botón de copiar. Historial real de conversaciones (se guarda en tu navegador).
- **Crear imágenes**: SD-Turbo se ejecuta en el navegador mediante WebGPU, sin clave ni servicio externo de generación. La salida nativa del modelo es 512×512; horizontal y vertical se adaptan mediante recorte central. La galería conserva las 8 creaciones más recientes en el almacenamiento del navegador.
- **Webs y apps**: constructor reforzado con instrucciones de diseño de producto, UX/UI, accesibilidad, responsive y funcionalidad real. Describe lo que quieres, mira la vista previa en vivo, pide cambios, cambia a vista móvil/tablet, copia o descarga el `.html`. También desde el chat: «crea una web de…».
- **Documentos**: lee PDF/TXT, extrae texto de imágenes (OCR) y permite preguntar sobre ellos.

## Novedades v3
- **Fotos en el chat:** adjunta, pega (Ctrl+V) o arrastra imágenes y NUBI las analiza (modo ☁ Nube). En Webs puedes subir una imagen de referencia para replicar un diseño.
- **Vídeos:** la IA programa una animación Canvas y la grabas con MediaRecorder. El navegador determina el formato disponible (normalmente WebM); no se garantiza MP4. Son gráficos en movimiento, no vídeo fotorrealista. La vista previa se pausa al salir del apartado para ahorrar CPU.
- **Más precisión:** razonamiento paso a paso en el prompt y refuerzo con Wikipedia en preguntas de datos.
- **Memoria:** NUBI descarga el motor SD-Turbo de memoria al terminar cada imagen y libera el motor de texto antes de cargarlo. Los archivos del modelo pueden permanecer en la caché del navegador para evitar volver a descargarlos.

## Doblaje de vídeos gratis
- Nueva categoría **Traducir vídeos**: acepta MP4, MOV y WEBM (hasta 150 MB y 20 minutos).
- Whisper Tiny reconoce el diálogo inglés en el navegador; la traducción de texto usa el servicio gratuito de Pollinations.
- El modelo **MMS-TTS español** genera una voz sintética en español en el navegador. FFmpeg WebAssembly sustituye la pista de audio original y exporta un MP4 sin subtítulos.
- El vídeo no se sube: transcripción, voz y exportación se hacen en el dispositivo. La traducción sí requiere internet y el servicio gratuito puede tener límites o estar temporalmente caído.
- El doblaje usa una voz sintética única, no imita la voz de las personas del vídeo. Los tiempos se aproximan a los segmentos detectados y puede haber desfases.
- La primera vez se descargan modelos y componentes; empieza con clips cortos para evitar agotar la memoria de Chrome.
## Motores de IA (selector arriba a la derecha)
| Modo | Cómo funciona | Pros / contras |
|---|---|---|
| ☁ Nube rápida (por defecto) | Servicio gratuito Pollinations, sin clave | Muy rápido y más listo. Tus mensajes salen a ese servicio. |
| ⚡ Local ligero | Qwen2.5 0.5B en tu navegador (WebGPU) | Privado, descarga ~0,3 GB. Menos potente. |
| 🧠 Local avanzado | Qwen2.5 1.5B en tu navegador (WebGPU) | Privado, descarga ~1 GB. Más lento. |
| 🚀 Local potente | Qwen2.5 3B en tu navegador (WebGPU) | Privado, descarga ~2,4 GB y necesita bastante memoria gráfica. |

Si la nube falla, NUBI muestra un error y no descarga automáticamente otro modelo: así evita un pico inesperado de memoria en Chromebook. Puedes seleccionar un modelo local manualmente. La generación fotográfica usa SD-Turbo local; necesita WebGPU y descarga aproximadamente 2,3 GB la primera vez. El modelo se libera después de cada imagen, pero los archivos descargados pueden permanecer en la caché del navegador.

## Búsqueda web v4
- Nueva sección **Buscar en Internet** en el menú lateral.
- Busca páginas públicas con DuckDuckGo y vídeos de YouTube; abre resultados en una pestaña nueva.
- Permite enviar el tema y los resultados visibles al chat para que NUBI los explique.
- La búsqueda usa un servicio proxy externo (Jina Reader), por lo que puede fallar, aplicar límites o no indexar algunas páginas. No equivale a acceso directo a todas las webs.
- El modelo recibe un máximo práctico de 20 imágenes por mensaje. La galería guarda las 8 creaciones más recientes. Las imágenes y conversaciones se guardan en el almacenamiento local del navegador, sujeto a su cuota; si se llena, NUBI avisa y no borra automáticamente la galería.

## Publicar
Sube `index.html`, `app.js`, `styles.css`, `README.md` y `.nojekyll` a tu repo y activa **Settings → Pages → Deploy from a branch → main / (root)**. Borra `worker.js` si aún existe.

## Límites
Son servicios gratuitos: pueden ir lentos, tener cuotas o caerse. Ninguna IA gratuita «lo sabe todo». No envíes datos privados en modo nube.


**Aviso para vídeos largos:** el límite máximo es 20 minutos y 150 MB. El doblaje se procesa en el navegador y puede consumir mucha memoria y tardar bastante, especialmente en Chromebooks. Para evitar cierres, se recomienda empezar con clips cortos y usar vídeos comprimidos de baja resolución. No se garantiza que todos los dispositivos puedan procesar 20 minutos.
