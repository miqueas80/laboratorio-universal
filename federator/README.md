# NEXUS-X — Federador educativo (D1/Workers, NO desplegado)

Este servicio experimental y opcional permite descubrir **metadatos educativos públicos**. No copia PDFs ni inventarios, no accede a Google Drive y NO se activa automáticamente en el núcleo Local-First. No está publicado ni certificado.

## Componentes

- policy.mjs: reglas puras para validar el snapshot completo, titularidad, retiro, revisión y replay.
- schema.sql: inscripción administrativa de instituciones, recursos, feeds originales y FTS5; triggers SQL para control concurrente, revocación y aislamiento.
- worker.mjs: API pública de búsqueda y catálogos firmados, más ingesta bajo claves preinscritas.
- wrangler.toml.example: plantilla sin credenciales ni ID reales; workers_dev=false por defecto.
- tests/federator.test.mjs: tests con SQLite/FTS5 real de Node 22; no se despliegan servicios.

## Identidad institucional y autorización

Un UUID y una clave Ed25519 **NO acreditan por sí solos la existencia o titularidad de una escuela**. El registro en publishers debe hacerlo un operador confiable, tras comprobar a la institución y la huella de su clave por un canal independiente. No existe endpoint público para registrarse, revocar, cambiar claves o asignar roles.

La ingesta verifica criptográficamente el catálogo firmado y que su clave sigue inscrita y activa. Una firma de una cuenta escolar no autentica individualmente a los docentes. Los registros previos no pueden omitirse de una actualización: hace falta un aviso explícito de retiro firmado con revisión mayor. La SQL refuerza las reglas con CAS sobre epoch, batch transaccional, triggers de autorización y revisión. Los avisos retirados no se pueden reactivar con un identificador viejo.

Un tercero puede volver a enviar un feed firmado público; por eso los reintentos idénticos son idempotentes y las versiones antiguas se rechazan. Antes de un endpoint público real también se necesitan WAF, limitación de tráfico, moderación, registro de abusos sin PII y política de renovación/revocación de claves.

## Endpoints del piloto

- GET /health — comprobación de configuración.
- GET /api/v1/search?q=quimica&subject=quimica&limit=25&cursor=0 — búsqueda de fichas públicas, 100 máximo por página, cursor por ID estable.
- GET /api/v1/catalog/<ws-uuid> — catálogo firmado ORIGINAL de la escuela activa.
- POST /api/v1/ingest (application/json, máximo 3 MiB) — solo catálogos Ed25519 firmados por una escuela inscrita.

Los resultados de búsqueda son *descubrimiento*, no prueba independiente de autoría: para confiar en una ficha hay que descargar y verificar el catálogo original firmado, comprobar la clave fijada de la escuela y la licencia. La ingesta no permite CORS en navegadores. Una escuela aún necesita usar un canal administrativo explícito (por ejemplo curl) para presentar el feed; no se afirma publicación automatizada.

## Procedimiento de despliegue NO ejecutado

1. Conseguir autorización institucional, evaluación de costos y gobernanza legal de metadatos; definir operador/roles.
2. Crear una D1 NUEVA para piloto; no tocar los datos de Laboratorio2.0 ni recursos Cloudflare preexistentes.
3. Copiar wrangler.toml.example a wrangler.toml en este directorio, completar el ID nuevo y revisar configuración; workers_dev sigue deshabilitado.
4. Ejecutar npm test en la raíz y revisar los resultados y el threat model.
5. Aplicar schema.sql a la D1 nueva mediante wrangler d1 execute, tras una revisión del operador autorizado.
6. Inscribir cada publisher_id y public_key con SQL administrativo después de verificar identidad y huella fuera de banda. Esquema: INSERT INTO publishers(publisher_id,display_name,public_key,verified_by,verification_note,active) VALUES(?,?,?,?,?,1). No interpolar entradas sin parametrizar.
7. Configurar protecciones antiabuso, monitoreo, backups, derechos de autor, privacidad y límites de recursos antes de exponer un endpoint HTTPS.
8. Tras autorizar el piloto, un administrador puede probar con: curl -X POST -H 'Content-Type: application/json' --data-binary @catalogo-firmado.json https://<endpoint-de-pruebas>/api/v1/ingest.
9. Revocar una escuela con operación administrativa SQL: UPDATE publishers SET active=0 WHERE publisher_id=?; comprobar que no aparece en búsqueda y rechaza ingesta.

## Límites y deuda técnica

El catálogo inicial admite como máximo 2.000 fichas por institución y no indexa contenido completo. D1 aún NO fue probado aquí con una cuenta real ni cargas nacionales. Para millones de recursos se requieren índices particionados, paginación verificable a escala, límites/costos medidos, autoridad de identidades, recuperación de claves, retención de retiros, moderación, pruebas externas y un proceso legal. La meta de costo cero solo aplica al núcleo offline, no garantiza costo cero del federador.

## Fuentes para verificar integración actual

- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://developers.cloudflare.com/d1/sql-api/sql-statements/
- https://github.com/OWASP/ASVS/blob/master/5.0/en/0x17-V8-Authorization.md
