# NUBI AI

Chat, generador de imágenes y constructor de webs. **Sin API key, sin backend.** Funciona con solo subir estos archivos a GitHub Pages.

## Qué hace
- **Chat rápido** con respuestas en directo, Markdown, tablas y bloques de código con botón de copiar. Historial real de conversaciones (se guarda en tu navegador).
- **Crear imágenes**: estilos (realista, anime, pixel art, 3D, óleo, logo), formatos y galería. También desde el chat: «dibuja una imagen de…».
- **Webs y apps**: describe lo que quieres, mira la vista previa en vivo, pide cambios, cambia a vista móvil/tablet, copia o descarga el `.html`. También desde el chat: «crea una web de…».
- **Documentos**: lee PDF/TXT, extrae texto de imágenes (OCR) y permite preguntar sobre ellos.

## Motores de IA (selector arriba a la derecha)
| Modo | Cómo funciona | Pros / contras |
|---|---|---|
| ☁ Nube rápida (por defecto) | Servicio gratuito Pollinations, sin clave | Muy rápido y más listo. Tus mensajes salen a ese servicio. |
| ⚡ Local ligero | Qwen2.5 0.5B en tu navegador (WebGPU) | Privado, descarga ~0,3 GB. Menos potente. |
| 🧠 Local avanzado | Qwen2.5 1.5B en tu navegador (WebGPU) | Privado, descarga ~1 GB. Más lento. |

Si la nube falla y tu navegador tiene WebGPU, NUBI cambia sola a la IA local. Las imágenes usan Pollinations; si no responde, la IA dibuja un SVG.

## Publicar
Sube `index.html`, `app.js`, `styles.css`, `README.md` y `.nojekyll` a tu repo y activa **Settings → Pages → Deploy from a branch → main / (root)**. Borra `worker.js` si aún existe.

## Límites
Son servicios gratuitos: pueden ir lentos, tener cuotas o caerse. Ninguna IA gratuita «lo sabe todo». No envíes datos privados en modo nube.
