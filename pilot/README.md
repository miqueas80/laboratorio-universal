# NEXUS-X Malla Federal: piloto entre dos dispositivos

Este prototipo **no modifica NEXUS-X principal ni requiere servidor**. La prueba intercambia únicamente metadatos educativos ficticios mediante archivos JSON firmados digitalmente (Ed25519). Es un intercambio entre dispositivos *mediado por el usuario*, no sincronización automática en tiempo real.

## Probar desde dos celulares Android

1. Descargá el ZIP `nexus-malla-dos-celulares` desde GitHub Actions (rama `feature/malla-dos-dispositivos`). Extraé `MALLA-FEDERAL-DOS-CELULARES.html` y abrilo con Chrome/Edge en **los dos celulares**.
2. Seleccioná **Escuela A** en el primero y **Escuela B** en el segundo.
3. En A, pulsá **Crear ficha de demostración** y **Exportar catálogo firmado**. Obtendrás un archivo `.json`.
4. Compartí ese archivo JSON **como documento** por Bluetooth, Quick Share, WhatsApp u otro medio de elección. En B pulsá **Elegir archivo firmado**.
5. Comprobá **la huella Ed25519 que aparece en A** contra la huella que B pide aceptar. Una firma correcta no equivale a verificar la identidad de la escuela.
6. Buscá `energía` en B. Apagá Wi-Fi/datos: la búsqueda debe seguir funcionando porque verifica el catálogo local.
7. Repetí B → A: importá la ficha de Química firmada por B y buscá `reacciones` en A.
8. Volvé a A, tocá **Retirar una ficha propia**, exportá otro catálogo y envialo nuevamente a B. Al importarlo debe desaparecer el título retirado sin borrar inventarios ni otras fichas.

Si tenés **un solo celular**, elegí A, generá y descargá el archivo, cambiá a B y hacé la importación; el cambio de escuela recarga la pantalla sin mezclar sus almacenamientos.

## Limitaciones del prototipo

- Las escuelas A, B y C son **identidades ficticias y locales**. No hay validación del Estado ni usuarios de instituciones reales.
- La identidad de firma se conserva en **IndexedDB** como clave privada no extraíble. Si el navegador prohíbe IndexedDB para archivos locales, el sistema mostrará un error; probalo en un origen HTTPS de pruebas si ocurre. **No expongas ni compartas la clave privada.**
- El archivo importado contiene solo registros de muestra creados voluntariamente. No incluye inventario, archivos escolares ni medios audiovisuales.
- No hay conexiones automáticas, servicios en segundo plano ni federador desplegado. El archivo se mueve por el medio que el usuario elija.
- La revocación requiere volver a compartir e importar el catálogo firmado más nuevo. Un receptor offline no conoce retiros futuros y no puede borrar copias distribuidas por otros canales.
- El software estable permanece intacto: la prueba utiliza solo core, almacenamiento y verificación de firma de la rama de pruebas.

## Compilar

```bash
node scripts/build-two-device-pilot.mjs
node --test tests/mesh-two-devices.test.mjs
```

El HTML portátil se genera en `dist/MALLA-FEDERAL-DOS-CELULARES.html`. No precisa `npm install` ni backend.
