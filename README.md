# NEXUS-X — Edición Institucional Limpia

Versión Local-First/Offline-First para distribuir a escuelas técnicas y laboratorios sin entregar datos de la institución que desarrolló el proyecto.

## Estado inicial

**0 registros, 0 sustancias, 0 documentos, 0 ubicaciones precargadas.** Ninguna escuela recibe archivos, inventario ni índices de otra institución. Se conservan la interfaz, la mascota, NEXUS IA, Lens local, voz, QR, PWA, informes, calendario y herramientas de inventario y documentación. Los motores de reconocimiento conservan solo categorías técnicas generales, no registros escolares.

## Instalación

1. Descargá el ZIP de esta rama **sin incluir el historial .git**. Extraelo en una carpeta nueva.
2. Publicalo en un hosting estático HTTPS (por ejemplo, GitHub Pages). No requiere backend para el núcleo.
3. Cada escuela debe tener **su propia ruta o dominio HTTPS**. Las claves localStorage e IndexedDB de inventario, documentos y referencias visuales se separan por ruta. Los datos nuevos se guardan en el navegador local del operador, no se trasladan con el ZIP.
4. Verificá que el dashboard muestre 0 registros y Documentos esté vacío. Creá un primer registro con el formulario, importá un Excel/Word compatible o cargá archivos PDF/Word/Excel para indexarlos.
5. Prepará los motores de voz y Lens offline desde la aplicación si hace falta; requieren espacio libre. QR e inventario local no necesitan Internet.
6. `config.js` permite configurar una URL HTTPS propia para el gateway opcional de xKiro. No incrustes contraseñas, tokens ni otras credenciales en el frontend público. Sin gateway, el núcleo local continúa operativo.

No añadas documentos de la escuela ni inventarios al paquete universal: esos datos corresponden a cada institución. Un cambio de URL o ruta puede separar los datos del operador anterior; realizá respaldos.

## Pruebas

Ejecutá `npm test` con Node.js (sin instalar dependencias) para comprobar que no se empacan contenidos institucionales. Verificá manualmente en navegador/Android el arranque, creación y edición, importación, persistencia tras recarga, QR, voz, Lens, modo avión y PWA.

## Advertencia sobre historial

**Este trabajo derivó de un repositorio cuyo historial Git ya contenía archivos escolares.** La rama tiene un árbol limpio y su ZIP descargado desde GitHub no contiene archivos del historial, pero **clonar el repositorio completo con .git sí puede recuperar versiones anteriores**. Para distribución pública con historial realmente limpio, copiá el contenido del ZIP en un repositorio nuevo e inicializá ahí su primer commit.

## Derechos

La licencia actual del software (`LICENSE`) reserva los derechos al titular. El titular debe autorizar su utilización o redistribución a otras instituciones. Se conservan las atribuciones y licencias de componentes de terceros.


## Google Drive institucional (vista previa en rama de prueba)

### Ruta 100% gratuita, sin Google Cloud ni claves

Esta ruta usa las herramientas del teléfono, no la API de Drive. NEXUS no pide tarjeta ni procesa credenciales de Google.

1. **Importar documento:** Documentos → «Elegir archivo (celular / Drive)». En Chrome Android, el selector de archivos puede ofrecer Google Drive como proveedor. Elegí un PDF, DOCX o Excel, que se indexa localmente y queda disponible sin Internet después de la importación.
2. **Guardar respaldo:** Documentos → «Preparar ZIP para compartir» y esperá la confirmación de preparación. Tocá el mismo botón otra vez («Compartir ZIP preparado») y, si aparece, elegí Drive desde el menú Compartir de Android. Seleccioná una carpeta y confirmá la subida dentro de Drive. NEXUS no puede verificar esa subida.
3. **Si el navegador no permite compartir archivos:** NEXUS descarga el ZIP. Abrí la aplicación Google Drive y usá «Nuevo» → «Subir archivo» para guardar el respaldo.
4. **Restaurar respaldo:** Documentos → «Importar ZIP (archivos / Drive)»; buscá el ZIP desde el selector del sistema (o descargalo previamente desde Drive), seleccioná el espacio correcto y confirmá la importación no destructiva.

La selección de Drive como origen o destino **depende del navegador, sistema operativo y apps instaladas**. Los archivos de Google Docs/Sheets nativos pueden requerir exportarlos a DOCX/XLSX antes de importarlos por el selector local. Solo se comparten archivos cuando el usuario confirma desde el dispositivo. Los ZIP pueden contener documentos, inventarios y calendarios escolares: compartilos solo con personas autorizadas; no hay cifrado E2E propio ni sincronización automática.

### Conexión OAuth opcional (para acceso directo mediante API)

**Alternativa inmediata en Android, sin credenciales de Google Cloud:** entrá en Documentos → «Elegir archivo (celular / Drive)». Se abre el selector de archivos del sistema; si Google Drive aparece como proveedor, podés seleccionar un PDF, DOCX o XLSX para indexarlo localmente. Esta ruta es una importación manual por el dispositivo, no una conexión OAuth ni una sincronización con Google Drive. Para «Importar desde Drive», «Subir a Drive» y respaldos compartidos sigue siendo necesaria la configuración detallada a continuación.

Google Drive es **opcional**, no forma parte del arranque ni del funcionamiento sin Internet. Los docentes pueden conectarse con OAuth, seleccionar documentos con Google Picker (scope limitado \`drive.file\`), importarlos al índice offline o guardar archivos en la carpeta \`NEXUS-X - Documentos\` de su propia cuenta.

Requiere que el responsable de la instalación configure una única aplicación en Google Cloud:

1. Habilitar **Google Drive API** y **Google Picker API** en Google Cloud.
2. Configurar Google Auth Platform / pantalla de consentimiento, usuarios de prueba o publicación y un OAuth Client ID tipo **Web application**. Autorizar el origen HTTPS de la aplicación (p. ej. \`https://miqueas80.github.io\` si se publica en GitHub Pages).
3. Crear una API key de navegador restringida por sitios de referencia HTTPS y APIs Google Picker/Drive. Incluir **ambas referencias**: \`https://miqueas80.github.io/*\` y \`https://docs.google.com/*\`. El iframe del Picker funciona desde docs.google.com y, sin esa referencia, puede mostrar «API developer key is invalid».
4. Anotar el **número del proyecto Google Cloud** (App ID del Picker).
5. Completar los tres valores públicos en \`config.js\`: \`googleDrive.clientId\`, \`googleDrive.apiKey\` y \`googleDrive.projectNumber\`. Son identificadores públicos, **no son secretos OAuth**; nunca colocar un client secret.
6. Abrir NEXUS-X HTTPS -> Documentos -> Conectar Google Drive. La primera pulsación carga Google Identity Services; la siguiente abre el consentimiento (para evitar el bloqueo de ventanas emergentes). Elegir **Importar desde Drive** o **Subir archivo a Drive**.

Google Drive permite archivos PDF, DOCX y Excel originales, y documentos nativos de Google (Docs -> DOCX, Sheets -> XLSX y Slides -> PDF). Cada archivo se valida por extensión/tamaño y pasa por el mismo indexador local; máximo 16 MB y las exportaciones nativas también tienen límite impuesto por Google (habitualmente 10 MB). Las cargas crean archivos en una carpeta propia de la cuenta autorizada. No hay sincronización automática ni acceso a todo Drive.

**Limitación multiinstitucional:** el aislamiento local actual es por URL/ruta de instalación, no por identidad de Google. El cambio de cuenta no cambia automáticamente el inventario ni los documentos locales del navegador. Para varias escuelas en el mismo dispositivo, usar perfiles/orígenes distintos hasta incorporar espacios de trabajo con IDs aislados. Google Drive no proporciona por sí solo autorización institucional multiusuario ni resolución automática de conflictos.

Los tokens de Google quedan **solo en memoria** y no se escriben en localStorage, IndexedDB, Github, informes o URL. Desconectar revoca el token cuando Google lo permite. Los recursos externos solo se cargan al activar Drive. Requiere Internet. Al estar vacío \`config.js\`, ningún docente puede conectar todavía: este código está listo para configuración y validación real de OAuth.


## Escuelas independientes y respaldos entre docentes (rama experimental)

- **Espacios aislados en cada navegador:** Documentos abre un panel para crear y abrir una escuela. Cada espacio usa prefijos propios en localStorage y bases separadas de IndexedDB (biblioteca y referencias Lens). El espacio `personal` conserva la ruta de datos existente para evitar borrar instalaciones previas. Los modelos de voz/visión, PWA y código público se reutilizan y no contienen información escolar.
- **Acceso entre dispositivos:** el docente crea un espacio institucional `ws-UUID`, copia el código y comparte por medios privados un ZIP. El segundo docente registra el mismo ID en su navegador, lo abre, y elige ese ZIP manualmente. Ese ID **no es una contraseña** y no concede acceso a Drive ni a datos remotos.
- **Respaldo ZIP:** exporta inventario, calendario y documentos con binario local disponible, hasta 200 archivos; avisa antes de continuar si se omiten archivos sin original local. Máximo 128 MB comprimido y 16 MB por documento. Importar comprueba la identidad institucional; en inventario incorpora IDs nuevos, preserva los locales ante colisiones diferentes y registra sus IDs en la clave local `nexus_workspace_last_conflicts`. Calendarios se fusionan por fecha y texto. Los documentos pasan por el indexador offline existente, que evita duplicados por huella.
- **Google Drive:** si OAuth está configurado, un docente puede guardar expresamente el ZIP en la carpeta `NEXUS-X - <workspaceId>` del Drive autorizado, compartir el archivo desde los permisos nativos de Drive con docentes concretos y seleccionar dicho ZIP mediante Google Picker en otros dispositivos. Nada se publica al repositorio y no hay sincronización automática o en segundo plano. El token OAuth permanece en memoria; el contenido del ZIP queda bajo los permisos normales de Drive, **no cifrado punto a punto por NEXUS-X**.
- **Seguridad y roles:** el aislamiento por espacio es **lógico, no una barrera de seguridad entre usuarios del mismo perfil de navegador**. Para separar profesores con permisos distintos hace falta una capa de identidad, reglas de autorización y un almacenamiento compartido con control de concurrencia comprobable. Google Drive administra permisos de archivo/carpeta; NEXUS-X **no** implementa todavía roles institucionales confiables, ni edición simultánea ni sincronización automática. No exponer URLs de Drive públicamente ni usar enlaces 'cualquiera con el enlace'.
- **Sin Internet:** creación/cambio de escuela, inventario, documentos locales y exportación/importación ZIP siguen funcionando. Solo conectar y transferir a Drive exige Internet y OAuth.
- **Validación:** `npm test` y el workflow de CI verifican estructura, aislamientos y fusión. Se requiere validación de inicio de sesión Google, permisos, carga/descarga y navegadores Android usando credenciales del administrador; el código no se entrega preautorizado.
