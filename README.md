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