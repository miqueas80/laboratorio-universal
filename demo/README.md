# Malla Federal NEXUS-X — Demo de tres escuelas

**Esta es una demostración local, no un servidor nacional ni un ambiente de producción.** Todas las escuelas, claves, títulos y registros de confianza se generan sintéticamente en tu dispositivo. Ningún documento escolar se incluye ni se transmite.

## La forma más rápida de probarla

1. Abrí **Actions → Malla Federal - Demo Portátil** en este repositorio y entrá en la última ejecución correcta de la rama `feature/malla-demo-pruebas`.
2. Descargá el archivo de la sección **Artifacts**, llamado `nexus-malla-demo-portatil`.
3. Extraé el ZIP y abrí `MALLA-FEDERAL-DEMO.html` con Chrome o Edge moderno. Es un único archivo con todas las bibliotecas necesarias integradas, así que puede abrirse sin servidor y sin Internet.
4. Tocá **Preparar las 3 escuelas**. Después verificá el registro ficticio, importá B y C, buscá fichas, activá el modo avión simulado y comprobá retiros/suspensiones. Si falla una prueba, anotá el mensaje del registro de eventos.
5. Podés apagar el Wi-Fi y los datos móviles luego de abrirla; las búsquedas y las verificaciones son locales. En Android, para abrir el archivo HTML es posible que necesites seleccionar el navegador desde Archivos. Si el navegador bloquea WebCrypto o almacenamiento local en archivos, abrilo desde un servidor HTTPS de prueba; no uses la versión principal de NEXUS.

## Construir localmente

Con Node 22 y el repositorio descargado:

```bash
node scripts/build-malla-demo.mjs
```

Se genera `dist/MALLA-FEDERAL-DEMO.html`. Este archivo contiene el **código real** `mesh/core.js`, `mesh/local.js` y `mesh/registry.js` de la rama. No incorpora `app.js`, inventario, Lens, XKiro, archivos escolares ni ningún motor pesado.

La demo guarda únicamente registros bajo un espacio de almacenamiento propio y ofrece **Restablecer SOLO esta demo**. No altera `main`, GitHub Pages de NEXUS ni recursos de Cloudflare.

## Advertencias

- La identidad institucional es ficticia y local; una clave de demostración no acredita pertenecer a una escuela real.
- La lista simula revocaciones solo mediante registros firmados locales; un navegador offline no conoce cambios futuros en una autoridad remota.
- El botón «modo avión simulado» solo cambia la interfaz; para probar desconexión real, desconectá físicamente el dispositivo.
- Las pruebas de navegador real Android/PWA siguen pendientes de tu validación; la CI automatiza firmas, lógica y empaquetado.
