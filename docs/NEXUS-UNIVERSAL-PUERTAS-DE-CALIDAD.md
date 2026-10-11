# NEXUS-X Universal — Puertas de calidad (no marketing)
Estado 2026-10-11: BASE DE PROTOCOLO EN EXPERIMENTACIÓN

| Etapa | Objetivo | Aceptación verificable |
| --- | --- | --- |
| E0 · Núcleo offline | PWA segura, inventario y modelos disponibles sin cloud | Android sin Internet, QR y búsquedas probadas |
| E1 · Escuelas aisladas | Instancia por escuela, migración reversible, respaldos | Sin mezcla de datos, exportación e importación reales |
| E2 · Motor de colaboración | Protocolo versionado, CAS, idempotencia, tombstones | Batería de pruebas adversariales y concurrencia |
| E3 · Identidad confiable | OAuth/OIDC, membresías, alta verificable y roles | Tests de autenticación, IDOR/BOLA, revocación |
| E4 · Servicio de coordinación | Gateway opt-in + base transaccional por institución | 2 clientes concurrentes, reintentos, cero pérdida |
| E5 · Sincronización local-first | outbox persistente + resolución de conflictos en UI | 48 horas offline y convergencia validada |
| E6 · Ingeniería de producción | telemetría sin PII, backups, seguridad, accesibilidad | auditoría, plan de incidentes, tests físico/CI |
| E7 · Piloto interinstitucional | Cohortes voluntarias sin datos sensibles | 3 escuelas, mediciones y resultados reproducibles |
| E8 · Adopción ampliada | Capacitación, documentación, soporte, gobernanza | pilotaje positivo y presupuesto sostenible |

**Actual**: E0-E1 parciales; E2 implementa únicamente el contrato/reference ledger, NO la red.
E3-E8 no están terminadas. No mergear a main una nueva etapa sin pruebas y revisión.
Condición constante: GitHub distribuye código y recursos; NUNCA datos escolares.
La promesa de excelencia se prueba con evidencias externas y reproducibles, no con el nombre MIT.
