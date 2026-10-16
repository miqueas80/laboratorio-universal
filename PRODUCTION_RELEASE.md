# NEXUS-X Universal — Puerta de producción (RC1)

**Estado:** candidato para piloto controlado, NO despliegue provincial masivo. 
**Rama fuente:** `lab/nexus-universal-modernizacion-20261015`.
**Regla:** no modificar `main` ni desplegar sobre un origen que contenga inventario, documentos o datos históricos sin respaldo verificable.

## 1. Evidencia obligatoria antes de distribuir

La ejecución de GitHub Actions en el **commit exacto** que se quiere entregar debe demostrar:

- `verify`: todas las regresiones pasan, sin excepciones ni casos omitidos;
- `browser`: instalación PWA, inventario, evento de calendario real, copia ZIP, rechazo de alteración, restauración en origen vacío y dos reinicios offline;
- `lens-real`: MobileCLIP-S0 y PP-OCRv6 Tiny **auténticos** en WASM, SHA-256 de archivos, reinicio offline;
- `package`: genera ZIP limpio, valida su contenido y ejecuta otra vez la suite de Chromium **desde el ZIP extraído**;
- artefacto `NEXUS-X-Universal-tested` disponible y SHA-256 del ZIP contrastado tras la descarga;
- los SHA de `main` y de la rama experimental se registran, sin mezcla accidental.

**Ninguna ejecución cancelada o parcialmente verde autoriza producción.**

## 2. Puesta en marcha de una escuela piloto

1. Confirmar titularidad y permisos de redistribución de código y modelos de terceros; mantener sus licencias.
2. Elegir un **origen HTTPS propio y aislado para esa institución**. Nunca usar otra ruta dentro de un origen compartido como frontera de seguridad.
3. Usar exclusivamente el ZIP validado del artefacto CI, comprobar `sha256sum -c`, extraerlo y publicarlo en un hosting estático con HTTPS. Servir los WASM/ONNX con los tipos MIME adecuados. No desplegar archivos `.git`, fuentes de otra escuela, tests, diagnósticos o secretos.
4. Configurar cabeceras HTTP en el hosting: CSP compatible con WASM local (reforzando `frame-ancestors 'none'` como **cabecera HTTP**, porque una CSP `meta` no aplica esa directiva); `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`; `Permissions-Policy` limitada según cámara/micrófono requeridos. No aplicar `Cross-Origin-Embedder-Policy` sin demostrar que los motores y recursos de terceros siguen cargando.
5. Comprobar en móvil y escritorio: 0 registros / 0 documentos al arrancar, creación/edición, exportación, QR, calendarios y restauración desde una **copia sintética**. Reiniciar y activar modo avión.
6. Descargar una vez los modelos opcionales y verificar tamaño, integridad, latencias y memoria en el **Android físico** de prueba. Validar permisos de cámara y micrófono; comparar WebGPU con WASM cuando WebGPU esté disponible.
7. Usar primero información de laboratorio sintética y no sensible. Una vez aprobado el piloto, acordar responsables, política de respaldo y períodos de retención de documentación escolar.

## 3. Recuperación y reversión

- Antes de actualizar, generar un ZIP institucional **en el navegador donde están los datos**, verificarlo y guardarlo fuera del dispositivo; conservar al menos dos copias en ubicaciones autorizadas.
- Desplegar cada actualización en un origen de pruebas equivalente y ejecutar ensayos online/offline; después sustituir **en bloque** el shell PWA del sitio de la escuela.
- Nunca importar un respaldo en una instalación con datos; usar únicamente la restauración en instalación nueva, vacía y con dos confirmaciones.
- Ante un fallo: conservar ZIP y almacenamiento original, congelar cambios y volver al paquete anterior **sin borrar IndexedDB ni localStorage**. Una actualización de Service Worker no restaura por sí sola datos que se hubieran modificado.
- Ante pérdida abrupta de energía durante restauración, **no dar por garantizada la atomicidad**: se escribe en IndexedDB y localStorage por separado. Requiere validación adicional antes de usarlo con datos institucionales sensibles.

## 4. Bloqueantes antes de escala provincial

- Ensayos físicos Android de cámara, OCR, voz offline y uso continuo;
- control de permisos, confidencialidad, operación y soporte de cada escuela;
- restauración recuperable ante cierre abrupto, cortes de energía y concurrencia real;
- revisión de seguridad independiente, pruebas de accesibilidad y normativa aplicable;
- estrategia de publicación de la malla federal **opcional**, autorizada y sin sincronizar inventarios privados.

**Decisión recomendada:** habilitar un piloto supervisado con datos sintéticos cuando todas las etapas CI y la prueba física estén aprobadas. **No** anunciar un despliegue provincial productivo hasta que esos bloqueantes se cierren.
