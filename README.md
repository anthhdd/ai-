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

## Traducir vídeos gratis
- Nueva categoría **Traducir vídeos** en el menú lateral: acepta MP4, MOV y WEBM (hasta 60 MB y 3 minutos).
- Whisper Tiny en el navegador transcribe el inglés; la traducción de texto usa el endpoint gratuito de Pollinations; FFmpeg WebAssembly genera un MP4 con subtítulos seleccionables en español.
- El vídeo no se sube: la transcripción y la exportación se hacen en el dispositivo. La traducción del texto sí requiere internet y el servicio gratuito puede tener límites o estar temporalmente caído.
- **Importante:** esta función conserva el audio original y añade subtítulos en español; todavía no crea doblaje de voz en español. El primer uso descarga modelos y componentes grandes, por lo que conviene empezar con clips cortos en Chromebooks.

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
