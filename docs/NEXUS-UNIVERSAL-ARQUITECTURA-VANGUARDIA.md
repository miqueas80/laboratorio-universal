# NEXUS-X Universal — Arquitectura de vanguardia (ADR-001)
Fecha: 2026-10-11
Estado: propuesta experimental / rama feature/nexus-universal-vanguardia
Decisión: Local-First absoluto + plataforma multiinstitucional con autoridad remota opcional.

## Visión verificable
Un único frontend estático y abierto a múltiples instituciones, pero ningún archivo, inventario,
operación o token de una escuela se debe publicar en GitHub ni ser legible desde otra institución.
Las funcionalidades útiles (inventario, documentos, NEXUS IA local, voz, QR, Lens) siguen
operando sin Internet ni proveedor de IA externo.

Esta propuesta NO declara producto nacional listo ni cumplimiento normativo certificado.

## Sistemas independientes

           GitHub Pages (código público y modelos reutilizables)
                                  |
       +--------------------------+------------------------+
       |                          |                        |
   Escuela A                  Escuela B                 Escuela C
 PWA en dispositivo       PWA en dispositivo       PWA en dispositivo
 - localStorage            - localStorage           - localStorage
 - IndexedDB                - IndexedDB             - IndexedDB
 - caché offline            - caché offline          - caché offline
 - cola de cambios          - cola de cambios       - cola de cambios
       |                          |                        |
       +--------------------------+------------------------+
                                  |
                        [OPCIONAL: API de colaboración]
                           - identidad y membresías
                           - autorización en servidor
                           - revisión + conflictos
                           - auditoría de escrituras
                           - aislamiento entre escuelas
                                  |
                      [almacenamiento por institución]
                      No repositorio Git / no tokens cliente

## Límites de confianza
1. El código de la PWA y las claves publicadas son NO CONFIABLES para hacer autorización.
2. Un identificador ws-UUID es un nombre local, NO una contraseña ni prueba de titularidad.
3. Google Drive sólo es un mecanismo externo opcional de importación y respaldo autorizado.
   El scope drive.file no garantiza compartir automáticamente archivos con todos los docentes.
4. Un servidor debe verificar Google/OIDC u otro IdP **criptográficamente** (issuer, audience,
   firma, exp, nonce/CSRF donde aplique), consultar la membresía institucional y asignar el
   rol desde datos propios. No se confía en rol, tenant ni membershipVerified del cuerpo HTTP.
5. La coordinación interdispositivo requiere servicio con autoridad sobre revisiones/roles.
   El modo offline nunca necesita estar conectado a ese servicio para sus funciones locales.
6. Para dispositivos compartidos entre escuelas se requieren perfiles de navegador separados
   o cifrado local y autenticación efectiva; el aislamiento lógico actual no protege frente a
   quien usa el mismo perfil del navegador.
7. Archivos de alumnos, notas, datos personales sensibles y secretos NO se incluyen por defecto.
   El diseño institucional debe evaluar protección de datos, minimización y consentimiento.

## Contrato de sincronización v1 (implementado como referencia, NO servidor)
Archivo: institutional/sync-core.mjs
- Operaciones estrictamente versionadas y con esquema cerrado.
- Clave (tenantId, entity, entityId), baseVersion y opId UUID.
- Operaciones de INVENTARIO/CALENDARIO; archivos/documentos explícitamente FUERA del stream.
- Lectura de cambios incremental, cursor monotónico y paginación con límites.
- Borrados como lápidas versionadas.
- Reintento con el mismo opId y contenido => resultado idempotente.
- Mismo opId y contenido distinto => rechazo.
- Colisión de baseVersion => conflicto; JAMÁS sobrescritura silenciosa.
- Lote atómico: ante un conflicto ninguna escritura del lote se confirma.
- Control de institución + rol en todas las lecturas/escrituras mediante principal VERIFICADO
  exteriormente; en esta etapa la función in-memory solo es un oráculo de contrato.
- Toda implementación real requiere persistencia transaccional, tests multi-inquilino y pruebas
  de penetración/autorización; no se deben usar mapas en memoria para producción.

## Servidor opcional — propuesta siguiente etapa (NO desplegado)
Un adaptador de API en Cloudflare Workers + Durable Objects SQLite por tenant
puede ofrecer serialización de revisiones y almacenamiento transaccional por objeto.
Alternativas: servicios gestionados equivalentes con capacidad de CAS/serializable.
Siempre: verificación de identidad con claves de IdP, registro de membresía con
alta administrativa auditada, revocación y transferencia de propiedad, ratelimit,
CORS restringido, registros auditables, protección contra replay, backup independiente,
recuperación ante desastre y borrado institucional documentado.

El backend NO se activa de forma silenciosa ni se despliega con credenciales por defecto.
No prometer costo $0 a escala: operaciones, almacenamiento, solicitudes, transferencia,
soporte y cumplimiento pueden tener costos variables.

## Control de versión / replicación
El servidor es autoridad sobre la revisión global por institución y la versión por entidad.
Cada operación tiene un opId estable entre reintentos. Los clientes registran cambios locales
antes de intentar enviar y procesan ACKs durables; cuando reconectan reciben cambios desde un
cursor validado y resuelven conflictos a través de UI humana (no LWW para datos críticos).
Futuro: persistencia de outbox en IndexedDB, sync con backoff, reconciliación de cambios,
observabilidad, políticas de retención y empaquetado cifrado de binarios por escuela.
Estas últimas capacidades son pendientes, no implementadas por el sync-core de referencia.

## Amenazas mínimas y evidencia necesaria
| Amenaza | Control requerido | Estado |
| --- | --- | --- |
| Acceso de Escuela A a Escuela B | Autorizar en servidor cada lectura/escritura | Test del contrato; servidor pendiente |
| Escritura concurrente perdida | CAS sobre baseVersion + resolución de conflictos | Oráculo y tests implementados |
| Dos reintentos duplican cambios | opId inmutable + recibo idempotente | Oráculo y tests implementados |
| Docente revocado continúa editando | Consulta de membresía en servicio confiable | Pendiente |
| XSS filtra Drive/token | CSP, escape de salida, revisión de dependencias | Pendiente auditoría |
| Caché/offline incluye información ajena | Espacios scoped + tests físico multi-perfil | Separación lógica; prueba física pendiente |
| ZIP intercambiado contiene contenido malicioso | Límite de tamaños y validación; fuzzing ZIP | Parcial; fuzzing pendiente |
| Pérdida de datos offline | Persistencia, exportaciones, restauración y pruebas de cuotas | Parcial |
| Operaciones destructivas equivocadas | Confirmación humana + log y recuperación | Parcial |
| Robo de dispositivo | Control de sesión, cifrado local, borrado selectivo | Pendiente |

## Criterios mínimos de piloto
- 3 instituciones voluntarias, 2 docentes, 2 dispositivos por institución.
- Abrir PWA sin Internet y completar inventario, QR, Lens y búsqueda.
- Cambiar institución sin ver inventarios/documentos ajenos (en perfiles separados).
- Dos docentes cambian simultáneamente el mismo registro: conflicto visible, ninguna pérdida.
- Repetir una escritura 20 veces: 1 solo efecto.
- Bloquear lectura y escritura de tenant ajeno aunque se falsifique URL/tenant/rol.
- Revocar un docente: bloquear nuevas escrituras y lecturas remotas de inmediato.
- Guardar y recuperar respaldo real tras limpieza intencional del perfil de pruebas.
- Medir p95 de acciones locales, memoria, IndexedDB/quota y éxito offline en Android.
- Paquete sin contenidos escolares; listado de licencias de modelos/bibliotecas.
- Revisión de accesibilidad de teclado, lector de pantalla, contraste y tamaño táctil.
- Documento de tratamiento de datos y revisión legal argentina antes de usar alumnos reales.

## Referencias de normas, NO certificados
- OWASP ASVS 5.0, V8.3.1 (autorización en servicio confiable) y V8.4.1 (multi-tenant):
  https://github.com/OWASP/ASVS
- NIST SP 800-63-4 (identidad/autenticación/federación):
  https://csrc.nist.gov/pubs/sp/800/63/4/final
- Google Drive API: scope drive.file y Picker:
  https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Durable Objects SQLite transaccional:
  https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
