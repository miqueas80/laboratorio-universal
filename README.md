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
