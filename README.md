# NEXUS-X — Edición Institucional Limpia

Versión Local-First/Offline-First para distribuir a escuelas técnicas y laboratorios sin entregar datos de la institución que desarrolló el proyecto.

## Estado inicial

**0 registros, 0 sustancias, 0 documentos, 0 ubicaciones precargadas.** Ninguna escuela recibe archivos, inventario ni índices de otra institución. Se conservan la interfaz, la mascota, NEXUS IA, Lens local, voz, QR, PWA, informes, calendario y herramientas de inventario y documentación. Los motores de reconocimiento conservan solo categorías técnicas generales, no registros escolares.

## Instalación

1. Descargá el ZIP de esta rama **sin incluir el historial .git**. Extraelo en una carpeta nueva.
2. Publicalo en un hosting estático HTTPS (por ejemplo, GitHub Pages). No requiere backend para el núcleo.
3. Para distribuir entre instituciones, **cada escuela debe usar un origen HTTPS independiente** (un dominio o subdominio propio, con configuración aislada). Las claves locales de NEXUS se organizan por ruta, pero **localStorage e IndexedDB están aislados por origen, no por ruta**: otra aplicación alojada bajo el mismo origen podría acceder a esos datos. No consideres carpetas/rutas distintas una frontera de seguridad. Los datos creados por cada operador quedan en su navegador y no viajan con el ZIP.
4. Verificá que el dashboard muestre 0 registros y Documentos esté vacío. Creá un primer registro con el formulario, importá un Excel/Word compatible o cargá archivos PDF/Word/Excel para indexarlos.
5. Prepará los motores de voz y Lens offline desde la aplicación si hace falta; requieren espacio libre. QR e inventario local no necesitan Internet.
6. `config.js` permite configurar una URL HTTPS propia para el gateway opcional de xKiro. No incrustes contraseñas, tokens ni otras credenciales en el frontend público. Sin gateway, el núcleo local continúa operativo.

No añadas documentos de la escuela ni inventarios al paquete universal: esos datos corresponden a cada institución. Un cambio de origen o ruta puede dejar inaccesibles los datos locales guardados con anterioridad; realizá respaldos verificables antes de migrar. El prefijo por ruta es una medida de organización, no un mecanismo de autorización ni aislamiento entre instituciones.

## Pruebas

Ejecutá `npm test` con Node.js (sin instalar dependencias) para comprobar que no se empacan contenidos institucionales. Verificá manualmente en navegador/Android el arranque, creación y edición, importación, persistencia tras recarga, QR, voz, Lens, modo avión y PWA.

## Respaldo institucional y recuperación offline

En **Ajustes** hay tres operaciones distintas:

1. **Descargar respaldo institucional ZIP:** exporta inventario, calendario, favoritos, índices y metadatos de documentos, además de los originales disponibles. Todo sucede localmente; no hay envío al Gateway ni a servidores. Los archivos que no tienen original local se indican como **no disponibles** en el respaldo.
2. **Comprobar respaldo ZIP:** lee el ZIP sin escribir inventario ni documentos. Verifica SHA-256 de datos y originales, IDs únicos y válidos, rutas permitidas y límites de tamaño. Rechaza archivos adulterados o incompletos.
3. **Restaurar solo en instalación vacía:** recupera inventario y documentos desde un ZIP previamente verificado. Requiere **una instalación nueva sin inventario, calendario, favoritos, documentos ni copias de recuperación**, escribir `RESTAURAR` y confirmar. No sobrescribe, no fusiona escuelas y no reemplaza registros existentes. En caso de fallos ordinarios intenta revertir los cambios.

**Cómo migrar una escuela:** desde el navegador original exportá el ZIP, descargalo y guardá otra copia segura. Volvé a verificarlo. Abrí NEXUS-X Universal en un nuevo origen HTTPS independiente, asegurate de que marque cero datos y usá el verificador de Ajustes. Solamente si la instalación está vacía se ofrecerá restauración. Después comprobá documentos e inventario, cerrá y reabrí la aplicación offline y conservá el ZIP mientras verificás que no falte nada.

**Límites de la versión experimental:** originales hasta 128 MiB en total, datos y metadatos hasta 64 MiB, ZIP de entrada hasta 160 MiB, máximo 3000 documentos y formato de ID NEXUS-X de cuatro dígitos. El respaldo **puede incluir información confidencial dentro de documentos y notas**: protegelo como una copia institucional privada, aun cuando excluya claves técnicas del Gateway.

**Advertencias técnicas:** `localStorage` e IndexedDB no comparten una única transacción. Las comprobaciones de concurrencia y la reversión reducen riesgos, pero no garantizan recuperación atómica ante cierre abrupto del navegador, apagón o fallos de hardware. Si se interrumpe una restauración, **no elimines datos ni fuerces otra importación**: conservá el ZIP y revisá el estado actual antes de continuar. El sistema no ofrece todavía sincronización ni copia en la nube. Las pruebas automatizadas de Chromium no reemplazan una validación física en Android con documentos institucionales de prueba y capacidad de almacenamiento real.

## Advertencia sobre historial

**Este trabajo derivó de un repositorio cuyo historial Git ya contenía archivos escolares.** La rama tiene un árbol limpio y su ZIP descargado desde GitHub no contiene archivos del historial, pero **clonar el repositorio completo con .git sí puede recuperar versiones anteriores**. Para distribución pública con historial realmente limpio, copiá el contenido del ZIP en un repositorio nuevo e inicializá ahí su primer commit.

## Derechos

La licencia actual del software (`LICENSE`) reserva los derechos al titular. El titular debe autorizar su utilización o redistribución a otras instituciones. Se conservan las atribuciones y licencias de componentes de terceros.
