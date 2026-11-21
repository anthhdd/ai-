# NUBI AI

Interfaz inicial de NUBI AI, una aplicación web en español.

## Funciones incluidas
- Interfaz adaptable a móvil y ordenador.
- Chat de demostración e historial local.
- Carga y vista previa de imágenes.
- Extracción de texto de PDF (primeras 20 páginas).
- Secciones preparadas para programación y generación de imágenes.

## Publicar con GitHub Pages
1. Entra en **Settings → Pages** en este repositorio.
2. En **Build and deployment**, selecciona **Deploy from a branch**.
3. Elige la rama **main** y la carpeta **/(root)**.
4. Pulsa **Save** y espera a que GitHub publique la web.
5. La dirección será https://anthhdd.github.io/ai-/

## Importante: conectar una IA real
Esta versión funciona en modo de demostración. Para obtener respuestas reales, generación de imágenes y análisis inteligente de imágenes/documentos necesitas conectar un proveedor de IA mediante un backend.

**No guardes claves API en `app.js`, `index.html` ni en ningún archivo público.** Cualquier visitante podría copiarlas. Guarda las claves como secretos del servidor y haz que el navegador llame a tu backend.

## Privacidad
El historial se guarda en el almacenamiento local del navegador. Los PDF e imágenes se procesan localmente para la vista previa/extracción básica; no se suben a un servidor en esta versión.

## Activar respuestas reales con Gemini + Cloudflare Workers

1. Crea una cuenta en Cloudflare y abre **Workers & Pages**.
2. Crea un Worker llamado `nubi-ai-api`.
3. Copia el contenido de `worker.js` y pégalo en el editor del Worker. Pulsa **Deploy**.
4. En la configuración del Worker, abre **Settings → Variables and Secrets → Add**.
5. Crea un secreto llamado `GEMINI_API_KEY` y pega ahí tu clave de Google AI Studio. No la compartas ni la publiques.
6. Opcionalmente, crea una variable de texto `GEMINI_MODEL` con valor `gemini-2.5-flash`.
7. Copia la URL de tu Worker (termina en `.workers.dev`).
8. Abre `app.js` y sustituye `PEGA_AQUI_LA_URL_DE_TU_WORKER` por esa URL. Guarda el cambio.

Después recarga la web. El chat enviará el historial reciente al modelo y mostrará sus respuestas.

Enlaces:
- Google AI Studio: https://aistudio.google.com/
- Cloudflare Workers: https://dash.cloudflare.com/

**Coste y privacidad:** Gemini ofrece un nivel gratuito limitado, sujeto a modelos, región y cuotas. Cloudflare Workers también tiene un plan gratuito con límites. No es ilimitado. Google indica que el contenido del nivel gratuito puede utilizarse para mejorar sus productos; no envíes datos privados o sensibles. El Worker restringe el origen a tu GitHub Pages, pero eso no sustituye un sistema completo contra abuso. Si publicas la web para todo el mundo, añade autenticación y límites de uso. Si eres menor de 18 años, pide ayuda a tu padre, madre o tutor para gestionar cuentas y claves.
