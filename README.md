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

## IA sin API key
NUBI ejecuta un modelo (Qwen2.5 vía WebLLM) directamente en el navegador con WebGPU y consulta la API pública de Wikipedia en español. No hay claves, ni Worker, ni backend.

- La primera respuesta descarga ~1 GB (queda en caché).
- Requiere un navegador con WebGPU (Chrome/Edge recientes). Sin WebGPU, muestra el resumen de Wikipedia.
- Un modelo pequeño no "lo sabe todo": puede equivocarse. Wikipedia mejora las respuestas factuales.

## Privacidad
El historial se guarda en el navegador. Tus mensajes solo se envían a Wikipedia como búsqueda; la generación ocurre en tu dispositivo.
