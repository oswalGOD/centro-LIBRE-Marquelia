# Centro LIBRE Marquelia

App para el Centro LIBRE Marquelia. El primer módulo es la **lista de asistencia**: captura de asistentes con firma en pantalla, registro de usuarias, folios automáticos e impresión del formato oficial "Lista de asistencia" (carta horizontal).

Es una app web instalable (PWA): se instala desde el navegador en Windows, Android e iPad/iPhone, funciona sin internet y no requiere tiendas de apps ni pagos.

## Qué hace hoy

- **Perfiles y roles**: Coordinadora, Psicóloga y Abogada, cada perfil con su PIN. La Coordinadora ve todo y administra los perfiles; la Psicóloga y la Abogada ven solo las actividades que crean o facilitan.
- **Actividades**: encabezado del formato, folio consecutivo por dispositivo (`MAR-2026-A001`), cierre de la lista.
- **Captura**: al escribir la CURP se llenan fecha de nacimiento, sexo, estado y rango de edad. Si la usuaria ya está registrada, se llenan todos sus datos. Admite personas sin CURP. Firma con el dedo o lápiz. No deja guardar con campos vacíos.
- **Escanear CURP**: con la cámara se lee el código QR de la constancia de CURP (impresa o en el celular) y se llenan la CURP, el nombre completo, la fecha de nacimiento, el sexo y el estado. Funciona sin internet y no envía datos a ningún lado. Si no hay cámara, se puede usar una foto. Usa la biblioteca [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0), incluida en `js/vendor/`.
- **Usuarias**: las personas que usan los servicios del Centro. Búsqueda, edición de datos e historial de asistencia de cada una.
- **Formato**: 10 personas por hoja con el resumen por grupo, rango de edad y sexo de cada hoja. Botón para imprimir o guardar en PDF.
- **Estadísticas**: por periodo, tipo de actividad y facilitadora; tablas por rango de edad, grupo y sexo y por actividad, contando asistencias o usuarias distintas. Descarga del resumen y de la lista detallada en CSV para Excel.
- **Sincronización**: los dispositivos conectados a la cuenta del Centro comparten perfiles, usuarias y actividades a través de Supabase. Cada uno sigue funcionando sin internet y envía sus cambios cuando vuelve la conexión.
- **Desarrollo** (Ajustes → Opciones para desarrolladores): protegida con contraseña. Diagnóstico descargable (sin datos de usuarias), errores recientes del dispositivo, volver a enviar o recibir todo, forzar actualización y restablecer el dispositivo. La contraseña se guarda como huella en `CLAVE_DESARROLLO` de `js/core/config.js`; la propia sección la genera la primera vez.
- **Respaldo**: la Coordinadora descarga y restaura un archivo `.json` con todos los datos.

## Configurar la sincronización (una sola vez)

1. En [Supabase](https://supabase.com), abre el proyecto → **SQL Editor** → **New query**, pega el contenido de [`supabase/esquema.sql`](supabase/esquema.sql) y toca **Run**.
2. **Authentication → Users → Add user → Create new user**: crea la cuenta del Centro (un correo y una contraseña segura) y marca **Auto Confirm User**.
3. **Authentication → Sign In / Providers**: desactiva **Allow new users to sign up**, para que nadie más pueda crear cuentas.
4. Ejecuta [`supabase/blindaje.sql`](supabase/blindaje.sql) cambiando antes el correo de ejemplo por el de la cuenta del Centro: solo esa cuenta podrá leer o escribir datos.
5. En cada tableta o computadora, la primera pantalla pide la cuenta del Centro y una letra distinta. Si la nube todavía no tiene perfiles, después se crea el de la Coordinadora.

**Si la tabla ya existía antes de la versión 0.5:** actualiza la app en todos los dispositivos y luego ejecuta una vez [`supabase/migracion-0.5.sql`](supabase/migracion-0.5.sql), que cambia los nombres de los registros ya guardados.

La dirección del proyecto y la clave pública están en `js/core/config.js`. Esa clave es pública por diseño: sin la cuenta del Centro no da acceso a ningún dato.

### Seguridad

- **Nadie configura la app sin la cuenta del Centro.** Tener el enlace no basta: la primera pantalla pide el correo y la contraseña de la cuenta, y los verifica el servidor de Supabase.
- **Solo la cuenta del Centro ve los datos.** La tabla tiene seguridad por fila: la clave pública sola no da acceso, y con `blindaje.sql` tampoco otra cuenta, aunque alguien lograra crearla.
- **Cada persona entra con su PIN.** Tras 30 minutos sin usarla, la app vuelve a pedirlo. Cada 5 PIN incorrectos se bloquea un rato que se duplica cada vez (30 s, 1 min, 2 min… hasta 15 min), aunque se recargue la página.
- **Política de contenido (CSP).** La página solo carga archivos propios y solo se comunica con Supabase, así que un script inyectado no se ejecuta.
- El código es público (GitHub Pages gratuito lo requiere). Eso no expone datos: no hay datos ni contraseñas en el código, solo la clave pública de Supabase y la huella de la contraseña de desarrollo.
- Si se pierde un dispositivo: cambia la contraseña de la cuenta del Centro en Supabase y cierra sus sesiones (Authentication → Users). Los datos guardados en el dispositivo solo los protege su PIN y el bloqueo de pantalla del propio equipo.

### Cómo resuelve conflictos

- Si dos dispositivos cambian el mismo registro, gana el cambio más reciente.
- Si dos dispositivos dan de alta a la misma usuaria (misma CURP) sin conexión, se fusionan en una sola y sus asistencias pasan a la que queda.
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

1. Crea `js/modulos/mi-funcion.js` que exporte `{ menu, rutas }` (copia la forma de `usuarias.js`).
2. Agrégalo a la lista `MODULOS` en `js/app.js`.
3. Agrega el archivo a `ARCHIVOS` en `sw.js` y sube el número de `VERSION` para que los dispositivos se actualicen.
4. Si el módulo guarda datos nuevos, crea su almacén en `js/core/db.js` (subiendo `VERSION`) y agrégalo a `SINCRONIZADOS` en `js/core/sync.js`. La tabla de Supabase no necesita cambios.

### Datos

Todo se guarda en el navegador del dispositivo (IndexedDB), en los almacenes `perfiles` (integrantes del Centro que usan la app), `usuarias` (personas que usan los servicios), `actividades`, `asistencias` y `meta`. Cada registro guarda `creado` y `actualizado`, y los borrados se marcan con `borrado: true` en lugar de eliminarse, para que la sincronización pueda reconciliar cambios entre dispositivos.

Cada asistencia guarda una copia de los datos de la usuaria tal como estaban ese día, para que la lista firmada no cambie si después se corrigen sus datos.

## Tipografías

Atkinson Hyperlegible, Bricolage Grotesque y Carlito, bajo la licencia SIL Open Font License 1.1 (https://openfontlicense.org).
