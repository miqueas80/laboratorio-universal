# NEXUS-X Universal — cierre verificable de ingeniería de la sesión 1

**Fecha:** 16/10/2026.  
**Rama de trabajo:** `lab/nexus-universal-modernizacion-20261015`.  
**Referencias protegidas:** `main` y `release/nexus-universal-rc1-20261015`.

## Alcance completado en software

- Captura OCR de fotos grandes limitada a un presupuesto máximo de 8 megapíxeles de RGBA y validación del worker; las capturas pequeñas conservan su resolución.
- Recuperación de errores al transferir trabajos a los workers locales, sin dejar solicitudes pendientes hasta timeout.
- Mediciones repetibles de MobileCLIP y OCR en sesiones frías y calientes bajo Chromium/WASM. No equiparar los tiempos CI con hardware Android.
- Respaldo ZIP local con originales y SHA-256, comprobación previa y restauración solo en un origen realmente vacío.
- Marca persistente de restauración incompleta y modo de protección al detectar una interrupción.
- Diagnóstico asistido de solo lectura: compara cantidades guardadas y permite descargar un JSON sin nombres, notas ni originales; **no confirma integridad solo por coincidencia de contadores**.
- Seguridad CSP y distribuciones ZIP limpias, comprobadas con suite Chromium en el paquete extraído.
- Navegación y reinicios offline Android **emulados**; regresiones de teclado en los diálogos.

## Puerta de liberación RC2

Antes de señalar un SHA como candidato RC2:
1. Las etapas `verify`, `Chromium PWA offline E2E`, `Real offline MobileCLIP and OCR` y `Clean production distribution ZIP` deben concluir en **success** sobre el mismo SHA.
2. Se comprueba que el ZIP extraído ejecuta las funciones sin red y que el informe de recuperación conserva los datos originales.
3. El artefacto `NEXUS-X-Universal-tested` con SHA-256 está disponible.
4. Se crea una rama `release/nexus-universal-rc2-20261016` apuntando exactamente al SHA aprobado, sin mezclar cambios ni modificar `main`.

## Bloqueantes fuera de CI

**La meta nominal 85% no puede certificarse todavía**: siguen pendientes pruebas físicas Android (cámara, micrófono, memoria, rendimiento real), revisión de restauraciones frente a cierres abruptos físicos, accesibilidad con tecnologías asistivas reales y pruebas de precisión visual con fotos de un laboratorio representativo.

Los porcentajes 70/85/100 son *estimaciones del objetivo*, no resultados medidos ni garantías de producción. RC2 será una base candidata para un piloto supervisado, no una certificación de distribución provincial.

## Prueba física mínima antes del piloto

En un Android real con Chrome actualizado y origen HTTPS exclusivo:
1. Abrir Universal con datos sintéticos y verificar que arranca vacío; instalar como PWA.
2. Preparar Lens, desconectar red, repetir reconocimiento con foto pequeña y grande; anotar tiempo, consumo y mensaje de errores.
3. Crear inventario y calendario; cerrar completamente la PWA; reiniciar en modo avión y comprobar persistencia.
4. Exportar un respaldo, verificarlo, restaurarlo **solo en un origen de pruebas vacío**; reiniciar offline y comprobar originales.
5. Simular una interrupción solamente con datos sintéticos, comprobar que la nueva ejecución bloquea restauraciones y el informe no contiene información privada. **No limpiar datos ni forzar la reparación.**
6. Verificar navegación por teclado y lector de pantalla cuando estén disponibles y registrar resultados para la aceptación.

**Criterio:** la evidencia del dispositivo y del piloto es necesaria para valorar el salto a producción institucional. Ningún porcentaje se incrementa automáticamente por pasar más pruebas.
