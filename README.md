# Centro LIBRE Marquelia

App para el Centro LIBRE Marquelia. El primer módulo es la **lista de asistencia**: captura de asistentes con firma en pantalla, padrón de personas, folios automáticos e impresión del formato oficial "Lista de asistencia" (carta horizontal).

Es una app web instalable (PWA): se instala desde el navegador en Windows, Android e iPad/iPhone, funciona sin internet y no requiere tiendas de apps ni pagos.

## Qué hace hoy

- **Usuarias y roles**: Coordinadora, Psicóloga y Abogada, cada una con su PIN. La Coordinadora ve todo y administra usuarias; la Psicóloga y la Abogada ven solo las actividades que crean o facilitan.
- **Actividades**: encabezado del formato, folio consecutivo por dispositivo (`MAR-2026-A001`), cierre de la lista.
- **Captura**: al escribir la CURP se llenan fecha de nacimiento, sexo, estado y rango de edad. Si la persona ya está en el padrón, se llenan todos sus datos. Admite personas sin CURP. Firma con el dedo o lápiz. No deja guardar con campos vacíos.
- **Padrón**: búsqueda, edición de datos e historial de asistencia por persona.
- **Formato**: 10 personas por hoja con el resumen por grupo, rango de edad y sexo de cada hoja. Botón para imprimir o guardar en PDF.
- **Respaldo**: la Coordinadora descarga y restaura un archivo `.json` con todos los datos.

Pendiente (siguiente etapa): sincronización entre dispositivos y estadísticas por actividad, rango de edad, grupo y sexo.

## Probar en tu computadora

No necesita instalar nada para compilar. Solo sirve la carpeta con cualquier servidor local:

```bash
python3 -m http.server 8080
# abre http://localhost:8080
```

El modo sin conexión y la instalación solo funcionan en `localhost` o en un sitio con `https`.

## Estructura

```
index.html              página única de la app
sw.js                   guarda la app en el dispositivo para usarla sin internet
manifest.webmanifest    nombre, colores e íconos para instalarla
css/                    estilos (incluye el formato imprimible)
js/app.js               arranque, inicio de sesión y rutas
js/core/                piezas compartidas: base de datos, sesión, catálogos, firma, permisos
js/modulos/             una pantalla o función por archivo
assets/                 logotipos, marca de agua y aviso de privacidad del formato oficial
fonts/                  tipografías incluidas para funcionar sin internet
```

### Agregar una función nueva

1. Crea `js/modulos/mi-funcion.js` que exporte `{ menu, rutas }` (copia la forma de `padron.js`).
2. Agrégalo a la lista `MODULOS` en `js/app.js`.
3. Agrega el archivo a `ARCHIVOS` en `sw.js` y sube el número de `VERSION` para que los dispositivos se actualicen.

### Datos

Todo se guarda en el navegador del dispositivo (IndexedDB), en los almacenes `usuarias`, `personas`, `actividades`, `asistencias` y `meta`. Cada registro guarda `creado` y `actualizado`, y los borrados se marcan con `borrado: true` en lugar de eliminarse, para que la sincronización pueda reconciliar cambios entre dispositivos.

Cada asistencia guarda una copia de los datos de la persona tal como estaban ese día, para que la lista firmada no cambie si después se corrige el padrón.

## Tipografías

Atkinson Hyperlegible, Bricolage Grotesque y Carlito, bajo la licencia SIL Open Font License 1.1 (https://openfontlicense.org).
