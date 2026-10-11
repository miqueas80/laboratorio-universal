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

Google Drive es **opcional**, no forma parte del arranque ni del funcionamiento sin Internet. Los docentes pueden conectarse con OAuth, seleccionar documentos con Google Picker (scope limitado \`drive.file\`), importarlos al índice offline o guardar archivos en la carpeta \`NEXUS-X - Documentos\` de su propia cuenta.

Requiere que el responsable de la instalación configure una única aplicación en Google Cloud:

1. Habilitar **Google Drive API** y **Google Picker API** en Google Cloud.
2. Configurar Google Auth Platform / pantalla de consentimiento, usuarios de prueba o publicación y un OAuth Client ID tipo **Web application**. Autorizar el origen HTTPS de la aplicación (p. ej. \`https://miqueas80.github.io\` si se publica en GitHub Pages).
3. Crear una API key de navegador restringida por sitios de referencia HTTPS y APIs Google Picker/Drive; Google Picker también puede necesitar autorización del origen \`https://docs.google.com/*\`.
4. Anotar el **número del proyecto Google Cloud** (App ID del Picker).
5. Completar los tres valores públicos en \`config.js\`: \`googleDrive.clientId\`, \`googleDrive.apiKey\` y \`googleDrive.projectNumber\`. Son identificadores públicos, **no son secretos OAuth**; nunca colocar un client secret.
6. Abrir NEXUS-X HTTPS -> Documentos -> Conectar Google Drive. La primera pulsación carga Google Identity Services; la siguiente abre el consentimiento (para evitar el bloqueo de ventanas emergentes). Elegir **Importar desde Drive** o **Subir archivo a Drive**.

Google Drive permite archivos PDF, DOCX y Excel originales, y documentos nativos de Google (Docs -> DOCX, Sheets -> XLSX y Slides -> PDF). Cada archivo se valida por extensión/tamaño y pasa por el mismo indexador local; máximo 16 MB y las exportaciones nativas también tienen límite impuesto por Google (habitualmente 10 MB). Las cargas crean archivos en una carpeta propia de la cuenta autorizada. No hay sincronización automática ni acceso a todo Drive.

**Limitación multiinstitucional:** el aislamiento local actual es por URL/ruta de instalación, no por identidad de Google. El cambio de cuenta no cambia automáticamente el inventario ni los documentos locales del navegador. Para varias escuelas en el mismo dispositivo, usar perfiles/orígenes distintos hasta incorporar espacios de trabajo con IDs aislados. Google Drive no proporciona por sí solo autorización institucional multiusuario ni resolución automática de conflictos.

Los tokens de Google quedan **solo en memoria** y no se escriben en localStorage, IndexedDB, Github, informes o URL. Desconectar revoca el token cuando Google lo permite. Los recursos externos solo se cargan al activar Drive. Requiere Internet. Al estar vacío \`config.js\`, ningún docente puede conectar todavía: este código está listo para configuración y validación real de OAuth.
