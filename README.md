# Centro LIBRE Marquelia

Aplicación para el Centro LIBRE Marquelia. El primer módulo es la **lista de asistencia**: captura de asistentes con firma en pantalla, registro de usuarias, folios automáticos e impresión del formato oficial "Lista de asistencia" (carta horizontal).

Es una aplicación web instalable (PWA): se instala desde el navegador en Windows, Android e iPad/iPhone, funciona sin conexión a internet y no requiere tiendas de aplicaciones ni pagos.

## Qué hace hoy

- **Perfiles y roles**: Coordinadora, Psicóloga y Abogada, cada perfil con su PIN. La Coordinadora puede ver toda la información y administra los perfiles; la Psicóloga y la Abogada pueden ver solo las actividades que crean o facilitan.
- **Actividades**: encabezado del formato, folio automático por mes y dispositivo (`OCT-2026-A001`), horario, notas, repetir una actividad, filtros por mes, tipo, facilitadora y estado, cierre de la lista. Las atenciones individuales (asesoría jurídica, atención psicológica) no van aquí: tendrán su propio módulo.
- **Captura**: al ingresar la CURP se completan fecha de nacimiento, sexo, estado y rango de edad. Si la usuaria ya está registrada, se completan todos sus datos. Admite personas sin CURP. La firma se captura con el dedo o con lápiz. No permite guardar con campos vacíos.
- **Escanear CURP**: con la cámara se lee el código QR de la constancia de CURP (impresa o en el celular) y se completan la CURP, el nombre completo, la fecha de nacimiento, el sexo y el estado. Funciona sin internet y no envía datos a ningún lado. Si no hay cámara, se puede usar una fotografía. Usa la biblioteca [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0), incluida en `js/vendor/`.
- **Escanear INE**: con una fotografía del frente se lee la CURP (se comprueba con su dígito verificador) y con una del reverso, el nombre, la fecha de nacimiento y el sexo (zona de lectura automática). Funciona sin internet con [Tesseract](https://github.com/naptha/tesseract.js) (Apache-2.0), incluido en `js/vendor/tesseract/`; la fotografía no se guarda ni se envía.
- **Evidencias fotográficas**: módulo del menú de inicio. Cada actividad tiene su carpeta de fotografías: se toman con el botón «Tomar fotografías» dentro de la actividad abierta (o desde la carpeta), con la cámara de la propia aplicación, que permite tomar varias seguidas. Todas se guardan en la misma proporción **4:3 horizontal** (máximo 1600 × 1200 px, JPEG comprimido de unos 150 a 300 KB), sin importar el dispositivo, para que al imprimirlas queden ordenadas. Cada foto admite una leyenda opcional. Funcionan sin conexión: se guardan en el dispositivo y se envían a un almacenamiento privado de Supabase al sincronizar; los demás dispositivos solo descargan una foto cuando se abre la carpeta de su actividad (así no se llena el equipo ni se gastan los datos del plan gratuito). Las pueden tomar, ver y eliminar quienes pueden ver la actividad (la actividad cerrada solo permite verlas). La impresión en PDF de las evidencias se agregará posteriormente.
- **Usuarias**: las personas que usan los servicios del Centro. Búsqueda, edición de datos e historial de asistencia de cada una.
- **Formato**: 10 personas por hoja con el resumen por grupo, rango de edad y sexo de cada hoja. Si la actividad tiene notas, se agregan en una hoja aparte. Botón para imprimir o guardar en PDF.
- **Estadísticas**: por periodo, tipo de actividad y facilitadora; tablas por rango de edad, grupo y sexo y por actividad, contando asistencias o usuarias distintas. Descarga del resumen y de la lista detallada en CSV para Excel.
- **Sincronización**: los dispositivos conectados a la cuenta del Centro comparten perfiles, usuarias y actividades a través de Supabase. Cada uno sigue funcionando sin conexión a internet y envía sus cambios cuando se restablece la conexión.
- **Desarrollo** (Ajustes → Opciones para desarrolladores): solo para la Coordinadora y protegida con contraseña. Diagnóstico descargable (sin datos de usuarias), errores recientes del dispositivo, volver a enviar o recibir todo, forzar actualización y restablecer el dispositivo. La contraseña se guarda como huella en `CLAVE_DESARROLLO` de `js/core/config.js`; la propia sección la genera la primera vez.
- **Panel del desarrollador** (`panel.html`, aparte de la app): con su propia cuenta de Supabase se consulta desde cualquier lugar el estado técnico de todas las tabletas (versión, última sincronización, cambios sin enviar, reloj, espacio y errores recientes), el espacio usado de la base de datos, conteos de registros y si la tarea «Mantener Supabase activo» está funcionando. Supabase solo deja ver datos técnicos a esa cuenta: no puede leer usuarias, firmas, perfiles ni actividades. Consulte [Configurar el panel del desarrollador](#configurar-el-panel-del-desarrollador).
- **Respaldo**: la Coordinadora descarga y restaura un archivo `.json` con todos los datos, cifrado con una contraseña que ella elige (sin esa contraseña no es posible abrirlo). Los respaldos sin cifrar de versiones anteriores se pueden seguir restaurando.

## Configurar la sincronización (una sola vez)

1. En [Supabase](https://supabase.com), abra el proyecto → **SQL Editor** → **New query**, pegue el contenido de [`supabase/esquema.sql`](supabase/esquema.sql) y seleccione **Run**.
2. **Authentication → Users → Add user → Create new user**: cree la cuenta del Centro (un correo y una contraseña segura) y marque **Auto Confirm User**.
3. **Authentication → Sign In / Providers**: desactive **Allow new users to sign up**, para que nadie más pueda crear cuentas.
4. Ejecute [`supabase/blindaje.sql`](supabase/blindaje.sql) cambiando antes el correo de ejemplo por el de la cuenta del Centro: solo esa cuenta podrá leer o escribir datos.
5. En cada tableta o computadora, la primera pantalla solicita la cuenta del Centro y un ID de dispositivo distinto (una letra). Si la nube aún no tiene perfiles, a continuación se crea el de la Coordinadora.

**Si la tabla ya existía antes de la versión 0.5:** actualice la aplicación en todos los dispositivos y luego ejecute una vez [`supabase/migracion-0.5.sql`](supabase/migracion-0.5.sql), que cambia los nombres de los registros ya guardados.

**Si la tabla ya existía antes de la versión 0.11:** ejecute una vez [`supabase/ajuste-0.11.sql`](supabase/ajuste-0.11.sql). Solo ajusta una función del servidor; no toca datos ni permisos.

**Para activar las evidencias fotográficas (versión 0.16):** ejecute una vez [`supabase/evidencias.sql`](supabase/evidencias.sql) (requiere haber ejecutado `blindaje.sql`). Crea el almacenamiento privado «evidencias» y solo la cuenta del Centro puede leerlo o escribir en él. Mientras no se ejecute, las fotos se guardan en el dispositivo y la sincronización avisa que falta crear el almacenamiento. Nota: el respaldo `.json` incluye los datos de las evidencias pero no las imágenes, que se recuperan de la nube.

**Para que Supabase no pause el proyecto** (en el plan gratis lo hace tras unos 7 días sin uso), la tarea automática `.github/workflows/mantener-supabase.yml` hace una consulta pequeña cada 3 días. Se ve en GitHub → Actions; si falla, probablemente el proyecto está pausado y es necesario reactivarlo en supabase.com.

**Ojo:** volver a ejecutar `esquema.sql` regresa los permisos a «cualquier cuenta». Si lo hace, ejecute `blindaje.sql` inmediatamente después.

La dirección del proyecto y la clave pública están en `js/core/config.js`. Esa clave es pública por diseño: sin la cuenta del Centro no da acceso a ningún dato.

### Configurar el panel del desarrollador

1. En Supabase, **Authentication → Users → Add user → Create new user**: cree su cuenta de desarrollo con un correo **distinto** al de la cuenta del Centro y marque **Auto Confirm User**.
2. **SQL Editor → New query**: pega [`supabase/panel-desarrollo.sql`](supabase/panel-desarrollo.sql), cambia el correo de ejemplo por el de tu cuenta de desarrollo y seleccione **Run**. Si pones el correo de la cuenta del Centro, el script se detiene.
3. Abra `panel.html` en la misma dirección de la aplicación (por ejemplo `https://…github.io/centro-LIBRE-Marquelia/panel.html`) e ingrese con esa cuenta. No hay enlace al panel dentro de la aplicación.

Las tabletas empiezan a aparecer cuando tienen la versión 0.14 y sincronizan. Reportan como mucho cada 30 minutos, o antes si cambió la versión o hubo un error nuevo. Los mensajes de error se envían sin CURP. La sesión del panel se cierra al cerrar la pestaña.

### Seguridad

- **Nadie configura la aplicación sin la cuenta del Centro.** Tener el enlace no basta: la primera pantalla solicita el correo y la contraseña de la cuenta, y los verifica el servidor de Supabase.
- **Solo la cuenta del Centro ve los datos.** La tabla tiene seguridad por fila: la clave pública sola no da acceso, y con `blindaje.sql` tampoco otra cuenta, aunque alguien lograra crearla.
- **Cada persona ingresa con su PIN.** Tras 30 minutos sin actividad, la aplicación vuelve a solicitarlo. Cada 5 PIN incorrectos se bloquea un rato que se duplica cada vez (30 s, 1 min, 2 min… hasta 15 min), aunque se recargue la página.
- **Política de contenido (CSP).** La página solo carga archivos propios y solo se comunica con Supabase, así que un script inyectado no se ejecuta.
- El código es público (GitHub Pages gratuito lo requiere). Eso no expone datos: no hay datos ni contraseñas en el código, solo la clave pública de Supabase y la huella de la contraseña de desarrollo.
- Si se pierde un dispositivo: cambie la contraseña de la cuenta del Centro en Supabase y cierre sus sesiones (Authentication → Users). Los datos guardados en el dispositivo solo los protege su PIN y el bloqueo de pantalla del propio equipo.

### Cómo resuelve conflictos

- Si dos dispositivos cambian el mismo registro, gana el cambio más reciente.
- Si dos dispositivos dan de alta a la misma usuaria (misma CURP) sin conexión, se fusionan en una sola y sus asistencias pasan a la que queda.
- Los folios llevan el ID del dispositivo, así que no se repiten. Si un dispositivo se restablece y vuelve a usar su letra, sigue después del folio más alto que ya existe. Si dos dispositivos usan el mismo ID, Ajustes lo avisa.
- Si una renovación de la sesión falla por la señal, el dispositivo sigue conectado y lo vuelve a intentar; solo se desconecta si Supabase dice que la sesión ya no sirve.
- Al restaurar un respaldo, el dispositivo vuelve a recibir todo de la nube para quedarse con lo más nuevo.
- «Gana el más reciente» depende de la hora de cada equipo. Si la fecha u hora de un dispositivo está desfasada más de 5 minutos respecto al servidor, la aplicación lo avisa en la barra superior y en Ajustes.

## Probar en la computadora

No necesita instalar nada para compilar. Solo se requiere servir la carpeta con cualquier servidor local:

```bash
python3 -m http.server 8080
# abrir http://localhost:8080
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
panel.html, js/panel.js panel del desarrollador (solo en línea, con su propia cuenta)
js/modulos/             una pantalla o función por archivo
assets/                 logotipos, marca de agua y aviso de privacidad del formato oficial
fonts/                  tipografías incluidas para funcionar sin internet
```

### Agregar una función nueva

1. Cree `js/modulos/mi-funcion.js` que exporte `{ menu, rutas }` (siga la estructura de `usuarias.js`).
2. Agréguelo a la lista `MODULOS` en `js/app.js`.
3. Agregue el archivo a `ARCHIVOS` en `sw.js` y aumente el número de `VERSION` para que los dispositivos se actualicen.
4. Si el módulo guarda datos nuevos, cree su almacén en `js/core/db.js` (aumentando `VERSION`) y agréguelo a `SINCRONIZADOS` en `js/core/sync.js`. La tabla de Supabase no necesita cambios.

### Datos

Todo se guarda en el navegador del dispositivo (IndexedDB), en los almacenes `perfiles` (integrantes del Centro que usan la app), `usuarias` (personas que usan los servicios), `actividades`, `asistencias` y `meta`. Cada registro guarda `creado` y `actualizado`, y los borrados se marcan con `borrado: true` en lugar de eliminarse, para que la sincronización pueda reconciliar cambios entre dispositivos.

Cada asistencia guarda una copia de los datos de la usuaria tal como estaban ese día, para que la lista firmada no cambie si después se corrigen sus datos.

## Tipografías

Atkinson Hyperlegible, Bricolage Grotesque y Carlito, bajo la licencia SIL Open Font License 1.1 (https://openfontlicense.org).
