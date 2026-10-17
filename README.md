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

**Detección de interrupciones:** durante la restauración se escribe una marca local de operación en curso (solo metadatos, nunca originales ni credenciales). Una restauración completada o revertida sin errores retira esa marca. Si Android o el navegador se cierra de forma abrupta antes de finalizar, NEXUS-X detecta la marca al reiniciar, indica el problema en Ajustes, bloquea nuevas restauraciones y deja el inventario, los documentos, los favoritos y el calendario en modo de solo lectura para preservar el estado del incidente. Las lecturas y la exportación de diagnósticos siguen disponibles. **No borres la marca manualmente ni limpies los datos del navegador:** conservá el ZIP y el almacenamiento original para una revisión técnica. Este mecanismo es de detección, no de reparación automática ni de atomicidad entre IndexedDB y localStorage.

**Protección ante almacenamiento inaccesible (laboratorio):** si el navegador no puede comprobar la marca de recuperación en `localStorage`, NEXUS-X bloquea las nuevas escrituras de inventario, documentos, favoritos y calendario, y tampoco habilita la restauración. Un ZIP puede seguir verificándose en modo de solo lectura sin autorizar su importación. Revisá los permisos y el almacenamiento del navegador antes de reintentar; nunca borres datos institucionales para forzar una recuperación.

**Calendario y favoritos protegidos:** antes de modificar datos locales se verifica su lectura íntegra y, para el calendario, la versión exacta desde la que se construyó la edición. Si el contenido está corrupto, inaccesible o cambió en otra pestaña, no se reemplaza por una lista vacía. Se conserva el valor original para revisión.

**Arranque seguro y estado institucional:** si el navegador no permite leer el inventario local o el diario de restauración, NEXUS-X conserva los datos, bloquea las modificaciones y señala **REVISAR** en el panel, en lugar de informar falsamente que el sistema está listo. Ante este estado, no limpies datos del sitio ni instales sobre una escuela en producción.

**Restauración y fallos ambiguos de IndexedDB:** si la escritura de documentos informa un error pero estos pudieron quedar almacenados, NEXUS-X conserva la marca persistente y bloquea toda edición. No elimina automáticamente los originales ni interpreta una excepción como garantía de que la transacción fue revertida. Conservá el respaldo ZIP y solicitá revisión técnica.

**Lecturas institucionales estrictas:** antes de guardar inventario, restaurar una copia o crear un respaldo ZIP, NEXUS-X exige lecturas válidas de los datos críticos. Si el navegador niega el acceso al inventario, calendario, favoritos o copias, la operación se detiene en lugar de suponer que están vacíos o exportar un respaldo parcial. No borres datos del navegador para salir de este estado.

**Evaluación asistida en Ajustes:** si una restauración se interrumpe, el botón **Revisar restauración interrumpida** permite comparar los contadores declarados por la marca con los registros y documentos que aún están accesibles. También permite descargar un informe JSON **sin documentos, nombres ni notas privadas**, para la persona responsable del soporte técnico. Los recuentos pueden coincidir aun cuando los datos estén dañados: **el informe no autoriza borrar la marca, reintentar, ni declarar una restauración completa**. Conservá el ZIP original y realizá una revisión manual antes de tomar decisiones.

**Advertencias técnicas:** `localStorage` e IndexedDB no comparten una única transacción. Las comprobaciones de concurrencia y la reversión reducen riesgos, pero no garantizan recuperación atómica ante cierre abrupto del navegador, apagón o fallos de hardware. Si se interrumpe una restauración, **no elimines datos ni fuerces otra importación**: conservá el ZIP y revisá el estado actual antes de continuar. El sistema no ofrece todavía sincronización ni copia en la nube. Las pruebas automatizadas de Chromium no reemplazan una validación física en Android con documentos institucionales de prueba y capacidad de almacenamiento real.

## Advertencia sobre historial

**Este trabajo derivó de un repositorio cuyo historial Git ya contenía archivos escolares.** La rama tiene un árbol limpio y su ZIP descargado desde GitHub no contiene archivos del historial, pero **clonar el repositorio completo con .git sí puede recuperar versiones anteriores**. Para distribución pública con historial realmente limpio, copiá el contenido del ZIP en un repositorio nuevo e inicializá ahí su primer commit.

## Derechos

La licencia actual del software (`LICENSE`) reserva los derechos al titular. El titular debe autorizar su utilización o redistribución a otras instituciones. Se conservan las atribuciones y licencias de componentes de terceros.
