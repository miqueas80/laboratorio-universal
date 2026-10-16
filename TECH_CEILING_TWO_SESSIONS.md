# NEXUS-X Universal — Ruta de dos sesiones hacia el techo técnico

**Punto de referencia:** evaluación orientativa previa de 70% de madurez. 
**Importante:** un porcentaje de madurez no se calcula contando tests ni funcionalidades. Las metas 85% / 100% son objetivos relativos y se revisan con evidencia, no promesas de finalización.
**Rama de ingeniería:** `lab/nexus-universal-modernizacion-20261015`. 
**Congelado:** `release/nexus-universal-rc1-20261015`; no modificar ni publicar `main`.

## Sesión 1 — objetivo +15 puntos (70 → 85)

| Línea | Puntos objetivo | Criterio de aceptación |
| --- | ---: | --- |
| NEXUS Lens fiable y contenido en memoria | 5 | Captura OCR limitada en fotos grandes; transferencias fallidas no bloquean el motor; captura pequeña sin degradación; inferencia real offline |
| Rendimiento WebGPU/WASM y móvil | 4 | Benchmarks de sesiones frías y calientes, recuperación de pérdida de GPU, comparación en dispositivo compatible (si hay acceso) |
| Persistencia, respaldos y recuperación | 4 | ZIP verificado, no sobrescritura de escuelas, pruebas con pestañas simultáneas, investigación y mitigación de cortes durante restauración |
| Accesibilidad y regresión de producción | 2 | Navegación táctil, accesibilidad por teclado y lector de pantalla donde haya dispositivos, pruebas completas desde ZIP extraído |

**Regla de cierre:** el software y el ZIP construido desde el commit exacto pasan `verify`, `browser`, `lens-real` y `package`. No elevar la valoración si faltan los ensayos de hardware y fallas reales.

## Sesión 2 — objetivo +15 puntos (85 → techo definido)

| Línea | Puntos objetivo | Criterio de aceptación |
| --- | ---: | --- |
| Malla federal opcional | 5 | Compartir únicamente documentos autorizados, sin exponer inventarios, aislamiento entre instituciones, cancelación y modo offline íntegro |
| xKiro y voz offline | 4 | Instrucciones y recordatorios consistentes en modo online/offline, tests reales de micrófono, recuperación sin conectividad |
| Seguridad y operación institucional | 3 | Permisos, confidencialidad, política de actualizaciones y reversión, ensayos adversariales y respuesta a corrupción |
| Android real y aceptación piloto | 3 | Cámara, almacenamiento, micrófono, WebGPU/WASM, rendimiento y uso prolongado probados en dispositivos reales por el usuario/institución |

**Dependencias externas:** no es posible certificar resultados físicos Android, usabilidad real, precisión de clasificación de instrumentos o seguridad institucional solo con GitHub Actions. No declarar 100% del objetivo integral ni producción provincial sin esas validaciones.

## Entregables e interpretación

Cada sesión debe terminar con SHA del commit, cobertura y logs de pruebas, lista de cambios, riesgo residual y siguiente puerta de decisión. No crear nombres de versión ficticios ni afirmar benchmarks físicos sin mediciones.

El ideal de una “web al techo tecnológico” cambia con la evolución de navegadores y hardware: el 100% significa satisfacer **los criterios de aceptación definidos**, no que no exista ninguna mejora futura.
