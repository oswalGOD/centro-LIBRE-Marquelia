# Centro LIBRE Marquelia

App para el Centro LIBRE Marquelia. El primer módulo es la **lista de asistencia**: captura de asistentes con firma en pantalla, padrón de personas, folios automáticos e impresión del formato oficial "Lista de asistencia" (carta horizontal).

Es una app web instalable (PWA): se instala desde el navegador en Windows, Android e iPad/iPhone, funciona sin internet y no requiere tiendas de apps ni pagos.

## Qué hace hoy

- **Usuarias y roles**: Coordinadora, Psicóloga y Abogada, cada una con su PIN. La Coordinadora ve todo y administra usuarias; la Psicóloga y la Abogada ven solo las actividades que crean o facilitan.
- **Actividades**: encabezado del formato, folio consecutivo por dispositivo (`MAR-2026-A001`), cierre de la lista.
- **Captura**: al escribir la CURP se llenan fecha de nacimiento, sexo, estado y rango de edad. Si la persona ya está en el padrón, se llenan todos sus datos. Admite personas sin CURP. Firma con el dedo o lápiz. No deja guardar con campos vacíos.
- **Padrón**: búsqueda, edición de datos e historial de asistencia por persona.
- **Formato**: 10 personas por hoja con el resumen por grupo, rango de edad y sexo de cada hoja. Botón para imprimir o guardar en PDF.
- **Estadísticas**: por periodo, tipo de actividad y facilitadora; tablas por rango de edad, grupo y sexo y por actividad, contando asistencias o personas distintas. Descarga del resumen y de la lista detallada en CSV para Excel.
- **Sincronización**: los dispositivos conectados a la cuenta del Centro comparten usuarias, padrón y actividades a través de Supabase. Cada uno sigue funcionando sin internet y envía sus cambios cuando vuelve la conexión.
- **Respaldo**: la Coordinadora descarga y restaura un archivo `.json` con todos los datos.

## Configurar la sincronización (una sola vez)

1. En [Supabase](https://supabase.com), abre el proyecto → **SQL Editor** → **New query**, pega el contenido de [`supabase/esquema.sql`](supabase/esquema.sql) y toca **Run**.
2. **Authentication → Users → Add user → Create new user**: crea la cuenta del Centro (un correo y una contraseña segura) y marca **Auto Confirm User**.
3. **Authentication → Sign In / Providers**: desactiva **Allow new users to sign up**, para que nadie más pueda crear cuentas.
4. En la app, la Coordinadora entra a **Ajustes → Sincronización entre dispositivos** y conecta el dispositivo con esa cuenta.
5. En cada tableta o computadora nueva, en la primera pantalla elige **Ya la usamos en otro**, pon una letra distinta y entra con la misma cuenta.

La dirección del proyecto y la clave pública están en `js/core/config.js`. Esa clave es pública por diseño: sin la cuenta del Centro no da acceso a ningún dato.

### Cómo resuelve conflictos

- Si dos dispositivos cambian el mismo registro, gana el cambio más reciente.
- Si dos dispositivos dan de alta a la misma persona (misma CURP) sin conexión, se fusionan en una sola y sus asistencias pasan a la que queda.
- Los folios llevan la letra del dispositivo, así que no se repiten. Si dos dispositivos usan la misma letra, Ajustes lo avisa.

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
js/core/                piezas compartidas: base de datos, sesión, catálogos, firma, permisos, sincronización
supabase/esquema.sql    tabla y permisos de la sincronización
js/modulos/             una pantalla o función por archivo
assets/                 logotipos, marca de agua y aviso de privacidad del formato oficial
fonts/                  tipografías incluidas para funcionar sin internet
```

### Agregar una función nueva

1. Crea `js/modulos/mi-funcion.js` que exporte `{ menu, rutas }` (copia la forma de `padron.js`).
2. Agrégalo a la lista `MODULOS` en `js/app.js`.
3. Agrega el archivo a `ARCHIVOS` en `sw.js` y sube el número de `VERSION` para que los dispositivos se actualicen.
4. Si el módulo guarda datos nuevos, crea su almacén en `js/core/db.js` (subiendo `VERSION`) y agrégalo a `SINCRONIZADOS` en `js/core/sync.js`. La tabla de Supabase no necesita cambios.

### Datos

Todo se guarda en el navegador del dispositivo (IndexedDB), en los almacenes `usuarias`, `personas`, `actividades`, `asistencias` y `meta`. Cada registro guarda `creado` y `actualizado`, y los borrados se marcan con `borrado: true` en lugar de eliminarse, para que la sincronización pueda reconciliar cambios entre dispositivos.

Cada asistencia guarda una copia de los datos de la persona tal como estaban ese día, para que la lista firmada no cambie si después se corrige el padrón.

## Tipografías

Atkinson Hyperlegible, Bricolage Grotesque y Carlito, bajo la licencia SIL Open Font License 1.1 (https://openfontlicense.org).
