# NEXUS-X — Malla Federal de Conocimiento Educativo (ADR-002)

**Fecha:** 2026-10-11. **Estado:** piloto federado firmado, rama experimental. **No desplegado como servicio nacional.**

## Principio
Compartir *conocimiento autorizado*, nunca inventarios, datos de alumnos, archivos internos ni claves. El software permanece estático (GitHub Pages) y sigue funcionando sin Internet. Cada escuela mantiene su biblioteca local. El componente nuevo sólo comunica **metadatos explícitamente publicados** y sus URLs HTTPS externos autorizados por la escuela.

## Invariantes
1. **Opt-in por recurso**: NUNCA derivar publicaciones del inventario, de PDFs indexados localmente ni de contenido de Drive. Sólo un formulario voluntario con confirmación de derechos + revisión de privacidad.
2. **Seudónimo institucional**: el UUID de un espacio local no acredita la identidad de una escuela real. Una malla de producción debe tener registro de instituciones verificado, autoridades y revocación de membresía.
3. **Autenticidad criptográfica del catálogo**: cada instalación genera una clave Ed25519 no exportable en IndexedDB. Las exportaciones se firman sobre los campos canonizados. Importar verifica firma ANTES de mostrar o aceptar datos. En el primer contacto el profesor verifica la huella SHA-256 del public key **por otro canal** y la fija localmente (TOFU). Falsificaciones por cambio de clave se rechazan. **TOFU NO ES una PKI nacional**.
4. **Licencias declaradas**: CC0 / CC BY 4.0 / CC BY-SA 4.0 / CC BY-NC 4.0, seleccionadas solo por quien tiene derechos; atribución visible. Las licencias Creative Commons son generalmente irrevocables para quienes recibieron obras cumpliendo condiciones; retirar el catálogo no revoca ese permiso ni copias descargadas.
5. **No hay publicación automática de originales**: un enlace externo sólo sirve si el titular configuró sus permisos en su proveedor. NEXUS no modifica ACL de Drive ni vuelve público nada por sí solo.
6. **Retiro replicable**: aviso firmado status=withdrawn con revision mayor; al importarse hace desaparecer la ficha de la búsqueda local. Un catálogo antiguo no puede resucitarla mediante replay. No se puede garantizar borrado de capturas/cachés externos.
7. **Separación de dominios**: la malla nacional NO indexa inventarios escolares, ubicaciones de reactivos, datos escolares, expedientes ni texto íntegro de documentos privados; no usa búsqueda en esos almacenes sin autorización específica.
8. **Sin telemetría privada ni rastreo de alumnos**: recursos importados se guardan localmente en el navegador. No hay llamadas de red automáticas en el módulo de catálogo. No se expone un motor de publicación remota hasta diseñar roles/verificación institucional y consentimiento válido.
9. **Protección por capas**: el filtro de palabras para detectar datos personales es un filtro auxiliar, NO asegura ausencia de PII ni sustituye revisión humana/documental y medidas técnicas requeridas.

## Modelo de publicación piloto

Formato firmado \`NEXUS-MESH-1\` (JSON), campos obligatorios:
- Encabezado: \`format\`, \`schema\`, \`publisherId\`, \`publicKey\`, \`records\`, \`signature\`.
- Ficha: \`schema\`, \`id\`, \`revision\`, \`status\`, \`publisherId\`, \`publisherName\`, \`title\`, \`summary\`, \`subject\`, \`level\`, \`license\`, \`attribution\`, \`accessUrl\`, \`updatedAt\`, \`keywords\`.
- Retiro: \`schema\`, \`id\`, \`revision\`, \`status=withdrawn\`, \`publisherId\`, \`updatedAt\`; campos extra rechazados.

Controles: longitud/tipos/esquemas cerrados, URL HTTPS sin credenciales/tokens/query/fragmentos, tamaño máximo 3 MB por catálogo, 2.000 fichas por intercambio, 1.500 fichas importadas por instalación de prueba; firma Ed25519 y trust pin en el navegador, colisiones no destructivas, revisiones monotónicas y tombstones. El catálogo no transporta documentos binarios.

**Limitaciones:** los enlaces pueden dejar de funcionar, no se confirma públicamente la identidad solo con la firma, TOFU admite suplantación durante el primer intercambio si no se verifica la huella, una clave perdida impide seguir firmando avisos anteriores y la protección de privacidad requiere revisión legal y moderación real. Las claves no se exportan, por diseño; agregar recuperación/delegación será una decisión de seguridad posterior.

## Arquitectura objetivo para millones de documentos — NO IMPLEMENTADA

\`\`\`text
   Escuela/Profesor (PWA offline)       Otros profesores (PWA offline)
           | opt-in + firma                      | consultas
           |                                     |
       Nodo de institución --------------- API de descubrimiento
           | HTTPS + autenticación                    |
           +------------------ Federador nacional ----+
                                  |
                   Índice de metadatos shardeado
                 por materia / nivel / región / revisión
                                  |
                 Catálogos firmados + estados de retiro
                                  |
                   Búsqueda y ranking (no binarios)
                         |             |
                         v             v
                 Drive autorizado   Sitios escolares
                 con ACL del dueño  / repositorios OER
\`\`\`

### Particiones de responsabilidad
- **Publicador**: autoriza recursos, declara licencia, mantiene contenido y enlace externo. Firma registros.
- **Autoridad institucional**: verifica titularidad del espacio, altas/bajas de docentes, delegación y claves válidas.
- **Federador**: descubre metadatos firmados, valida autoridad/roles, indexa términos y revisiones, aplica retiros, rate limiting, abuso, copyright takedowns, catálogo nacional.
- **Cliente**: mantiene su índice offline acotado, busca, solicita el original al titular (respetando permisos), muestra atribución/licencia y origen.
- **Moderación**: reportes, prevención de malware, material sin derechos, privacidad, desinformación y material sensible. Verificación humana y apelaciones.

### Escalabilidad
Un millón de documentos no se guardará en \`localStorage\` de cada alumno: búsqueda paginada en servidor; indexación incremental por lotes y shards; cache local sólo de consultas/páginas descargadas; firmas/IDs/versiones; deduplicación opt-in por digest (sin cargar texto privado); métricas anónimas de latencia/disponibilidad; pruebas de carga y costo antes del lanzamiento. No afirmar que esta etapa ya soporta millones.

### Interoperabilidad
Usar un perfil de catálogos educativos interoperable inspirado en **W3C DCAT 3**. El JSON piloto propio NO debe etiquetarse DCAT 3-conforme hasta producir una serialización RDF/JSON-LD válida y demostrar conformidad. Futuro: OAI-PMH/ResourceSync o APIs de publicación delta; identificadores de recursos persistentes, DC Terms, interoperabilidad OER.

## Etapas siguientes obligatorias
- Registro nacional de instituciones con prueba de titularidad y administración delegada; OIDC/SSO y revocación.
- Gateway opcional con identidad verificada y autorización de publicación/retiro.
- Almacenamiento durable para catálogos, búsqueda federada paginada y política de actualización.
- Moderación, reportes, protección de datos, copyright, accesibilidad, fallback de origen.
- Tests de interoperabilidad con distintas escuelas, concurrencia, ransomware, paquetes maliciosos, PII, falsificación de autoría, falsos retiros y claves rotadas.
- Evaluación de licenciamiento/propiedad intelectual de recursos educativos bajo Ley 11.723.
- Tratamiento de datos personales y minimización según Ley 25.326 / autoridad competente.
- Prueba piloto multiinstitucional documentada; métricas reproducibles y revisión independiente.

## Referencias
- W3C DCAT 3: https://www.w3.org/TR/vocab-dcat-3/
- Ley 25.326, Argentina: https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion
- Ley 11.723, Argentina: https://www.argentina.gob.ar/normativa/nacional/42755/actualizacion
- Creative Commons CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
- Google Drive permissions: https://developers.google.com/workspace/drive/api/guides/manage-sharing
- OWASP ASVS: https://github.com/OWASP/ASVS
