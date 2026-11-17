# Reglas de diseño y lenguaje

**Centro LIBRE Marquelia · aplicación de campo · versión de referencia 0.44.0 · 17 nov 2026**

Esta guía reúne las reglas ya vigentes (PRs #47 a #75), el lenguaje de la aplicación y los elementos propuestos para módulos futuros. Todo módulo nuevo debe cumplirla. Los elementos de la sección 5 son propuestas; aún no existen en el código.

---

## 1. Principios

1. **Una acción principal por pantalla.** Va en la barra fija inferior (formularios) o como botón primario (listas).
2. **Todo icono lleva etiqueta corta.** En iPad no hay texto emergente.
3. **Cancelar es ✕ arriba, nunca junto a Guardar.**
4. **Lo destructivo o poco frecuente va en el menú ⋯**, con confirmación de doble toque.
5. **Buscar y filtrar se ve igual en todas partes:** búsqueda visible y botón «Filtros» con contador.
6. **Máximo dos filas de acciones** en celular. Si hay más, se pasan a ⋯.
7. **Tableta primero, celular sin sorpresas:** áreas táctiles de 44 a 52 px y sin desplazamiento horizontal de la página.
8. **Lo sensible se protege:** el modo captura, el PDF de la lista y los expedientes cifrados no se alteran sin solicitud expresa.
9. **Funciona sin conexión.** Ninguna pantalla depende de internet para abrir o guardar.

---

## 2. Componentes vigentes

| Componente | Cuándo usarlo | Regla | Código |
|---|---|---|---|
| **Botón primario** | La acción principal | Uno por pantalla; texto claro («Guardar asistente») | `.btn.primary` |
| **Botón secundario** | Acción de texto largo que no es la principal | Sin color de relleno | `.btn` |
| **Icono con etiqueta** | Toda acción secundaria y repetible | Icono + una palabra debajo. Variantes: normal, `primary`, `quieto`, `danger` | `botonIcono()` |
| **Menú ⋯** | Eliminar, cancelar, reabrir, acciones raras | Opciones en texto con icono; lo destructivo en rojo | `menuMas()` |
| **Tarjeta de datos** | Ficha de una actividad, usuaria o caso | Estado a la izquierda, acciones a la derecha, datos debajo | `.panel` + `.card-head` + `.facts` |
| **Fila de lista** | Toda lista que abre un detalle | Fecha o avatar · nombre y datos · cifra o estado | `a.row` |
| **Campo** | Formularios | Etiqueta arriba, ayuda corta debajo | `.field` |
| **Búsqueda y filtros** | Listas con más de 6 elementos | Búsqueda siempre visible; filtros plegados con contador | `botonFiltros()`, `conectarFiltros()` |
| **Selector de usuaria** | Elegir una usuaria | Nada hasta 2 letras; máximo 5 tarjetas; «Mostrando 5 de N» | `selectorUsuaria()` |
| **Barra fija inferior** | Guardar en formularios y cerrar en detalle | Una acción principal y, a lo sumo, una secundaria | `.barra-fija` |
| **Encabezado** | Toda pantalla | Atrás («← Inicio» o «← Volver») y título | `pintar()` |
| **Resumen** | Inicio de una lista | 3 o 4 mini-tarjetas con cifra y etiqueta | `tarjetas()` |
| **Cifras de análisis** | Estadísticas e Informes | Cifras grandes en dos columnas | `.tiles` |
| **Estado vacío** | Lista sin elementos o sin coincidencias | Título + una frase | `estadoVacio()` |
| **Chip de estado** | Estado de un registro | Un color por significado (ver 2.1) | `.chip` |
| **Datos en columnas** | Celular | Dos columnas; los datos largos ocupan la fila completa | `.facts.dos`, `.largo` |
| **Tabla con desplazamiento** | Estadísticas e Informes | Sombra en el borde que oculta columnas | `.table-scroll` |
| **Sección plegable** | Ajustes y ayudas | Una sola acción principal por sección | `<details>` |

### 2.1 Colores de estado

| Significado | Color | Ejemplo |
|---|---|---|
| Correcto, abierto, activo | Verde (`ok`) | Abierta, Frecuente |
| Advertencia, falta algo | Naranja (`warn`) | Sin CURP, Falta firma |
| Programado, próximo | Dorado (`gold`) o morado claro (`prog`) | Programada |
| Neutro, cerrado | Gris dorado (base) | Cerrada, Registrada |

El color nunca es la única señal: siempre va acompañado de texto.

### 2.2 Pantallas tipo

**Lista:** resumen → búsqueda + «Filtros» + botón de alta → filas → aviso «Ninguna … coincide».

**Detalle:** tarjeta de datos (estado, acciones, datos) → acción principal → secciones → barra fija si se cierra o confirma algo.

**Formulario:** ✕ arriba · campos · errores en un solo cuadro · barra fija con el botón de guardar.

**Exportación:** «Exportar PDF» (primario) + icono «Imprimir» + iconos de otras descargas + línea con hojas y tamaño.

---

## 3. Lenguaje

### 3.1 Reglas

1. **Español formal, trato de usted.** «Ingrese su PIN», nunca «ingresa tu PIN».
2. **Botones y etiquetas en infinitivo:** Guardar, Cancelar, Registrar, Editar. **Instrucciones en imperativo de usted:** Ingrese, Seleccione, Toque.
3. **Una idea por mensaje.** Ayudas de máximo dos frases. Avisos de una línea.
4. **Qué pasó y qué hacer, en ese orden.** Sin explicar cómo funciona por dentro.
5. **Sin tecnicismos:** no usar «caché», «base de datos», «sincronización fallida», códigos de error ni nombres de archivo internos.
6. **Sin culpar a la persona:** «No se pudo guardar», no «Usted hizo algo mal».
7. **Sin signos de exclamación, emojis ni mayúsculas sostenidas.** Los nombres de las usuarias se muestran en mayúsculas por el formato oficial.
8. **Sin rodeos:** quitar «por favor», «le informamos que», «es necesario que» y «recuerde que».
9. **Etiquetas de una a tres palabras.** Avisos y botones de hasta 12 palabras.
10. **Consistencia antes que variedad:** una misma cosa se llama siempre igual (ver 3.2).

### 3.2 Vocabulario fijo

| Usar | No usar |
|---|---|
| **usuarias** (personas que usan los servicios) | beneficiarias, clientas, pacientes |
| **perfiles** (integrantes del Centro que usan la app) | usuarios, cuentas |
| **Coordinadora**, **Asesora Psicoemocional**, **Asesora Jurídica** | Psicóloga, Abogada (solo son identificadores internos) |
| **actividad**, **curso** | evento, sesión (salvo «notas de sesión») |
| **lista de asistencia**, **asistentes** | registro de personas |
| **evidencias**, **fotografías** | imágenes, fotos |
| **caso**, **expediente** | ficha, historial clínico |
| **Inicio** | menú principal, dashboard |
| **PIN** | contraseña (esa palabra es solo de la cuenta del Centro) |
| **Guardar** | Aceptar, Enviar |
| **Cancelar** (cerrar sin guardar) | Salir, Volver (salvo «← Volver») |
| **Eliminar** | Borrar, Quitar (salvo «Quitar de esta lista») |

Género: se usa el femenino para las usuarias y los perfiles. Para casos neutros, «persona».

### 3.3 Formatos

| Dato | Formato | Ejemplo |
|---|---|---|
| Fecha | Día, mes abreviado, año | 15 nov 2026 |
| Hora | 24 h | 10:00 a 12:00 |
| Duración | Horas y minutos | 2 h, 1 h 30 min |
| Cantidades | Con singular y plural | 1 asistente, 3 asistentes |
| Folio | Mes-año-letra y número | NOV-2026-A001 |

### 3.4 Mensajes tipo

| Situación | Evitar | Preferir |
|---|---|---|
| Guardado | «¡La información se ha guardado exitosamente en el sistema!» | «Cambios guardados» |
| Error al guardar | «Ocurrió un error inesperado al intentar procesar su solicitud» | «No se pudo guardar. Intente de nuevo.» |
| Campo obligatorio | «El campo nombre es obligatorio y no puede estar vacío» | «Ingrese el nombre completo» |
| Sin resultados | «No se encontraron coincidencias para los criterios de búsqueda especificados» | «Ninguna usuaria coincide.» + «Modifique la búsqueda.» |
| Lista vacía | «Actualmente no existen registros en esta sección» | «Aún no hay notas.» + «Agregue la primera con el cuadro de arriba.» |
| Confirmar eliminar | «¿Está completamente seguro de que desea eliminar este elemento? Esta acción no se puede deshacer» | Botón «¿Seguro?» + aviso «Toque nuevamente para eliminar la nota» |
| Sin conexión | «Se ha perdido la conexión con el servidor» | «Sin conexión. Sus datos se enviarán al reconectar.» |
| Ayuda de campo | «Este campo se utiliza para almacenar el número de teléfono celular a diez dígitos de la usuaria» | «Teléfono a 10 dígitos» |

### 3.5 Longitudes máximas

| Elemento | Máximo |
|---|---|
| Etiqueta de icono | 1 palabra (2 si es indispensable) |
| Botón | 3 palabras |
| Título de pantalla | 4 palabras |
| Aviso (toast) | 1 línea, unos 60 caracteres |
| Ayuda bajo un campo | 1 frase |
| Ayuda de pantalla | 2 frases; si es más, va en una sección plegable |
| Estado vacío | Título + 1 frase |

---

## 4. Lista de verificación para un PR de interfaz

- [ ] Una sola acción principal; las demás son iconos con etiqueta o van en ⋯.
- [ ] Formularios con ✕ arriba y botón de guardar en la barra fija.
- [ ] Listas con búsqueda, «Filtros» (si hay filtros) y aviso de sin coincidencias.
- [ ] Estados vacíos con `estadoVacio()`.
- [ ] Textos en usted, en infinitivo para botones, sin tecnicismos y dentro de los máximos.
- [ ] Vocabulario de la sección 3.2.
- [ ] Capturas a 390 px, 820 px y 1100 px adjuntas al PR.
- [ ] Sin desplazamiento horizontal de la página en celular.
- [ ] Funciona sin conexión.
- [ ] Versión subida en `config.js` y `sw.js`.

---

## 5. Elementos propuestos para módulos futuros

Cada elemento indica para qué módulo serviría y su regla. Se construirían como componentes en `js/core/componentes.js` cuando un módulo los necesite por primera vez, no antes.

### 5.1 Línea de tiempo
**Para:** historial de una usuaria (notas, citas, canalizaciones), seguimiento de casos.
```
 ● 15 nov  Nota de sesión
 │         Texto breve de la nota…
 ● 12 nov  Cita atendida
 ● 08 nov  Canalizada a DIF
```
**Reglas:** más reciente arriba; cada punto con fecha, tipo y una línea; un toque abre el detalle; el tipo se distingue por icono y etiqueta, no solo por color.

### 5.2 Vista de calendario compacta
**Para:** Agenda de citas, actividades programadas.
```
 ◀  noviembre 2026  ▶        [Lista | Mes]
 L  M  M  J  V  S  D
 ·  ·  ·  ·  ·  1  2
 ... días con citas marcados con punto
 ── 17 nov ──────────────
 10:00  Cita · A. MARTÍNEZ
```
**Reglas:** vista de mes con un punto por día ocupado y la lista del día elegido debajo; en celular, por defecto la lista. El cambio Lista/Mes usa el control segmentado existente.

### 5.3 Hoja inferior
**Para:** elegir una opción o acción sin salir de la pantalla (reemplaza ventanas emergentes).
```
 ┌─────────────────────────┐
 │ ─                       │
 │ Elegir institución      │
 │ [Buscar…]               │
 │  DIF Municipal          │
 │  Fiscalía               │
 └─────────────────────────┘
```
**Reglas:** sube desde abajo, se cierra con ✕ o tocando fuera; una sola decisión por hoja; nunca más de una hoja abierta.

### 5.4 Campo con sugerencias
**Para:** instituciones, lugares, tipos de actividad (generaliza `selectorUsuaria`).
**Reglas:** misma conducta que el selector de usuaria: nada hasta 2 letras, máximo 5 sugerencias, opción final «Agregar “…”» si no existe. Lo agregado se recuerda para la próxima vez.

### 5.5 Selección múltiple con barra de acciones
**Para:** emitir constancias, canalizar o exportar a varias personas a la vez.
```
 [✓] A. MARTÍNEZ
 [✓] R. GÓMEZ
 ┌────────────────────────┐
 │ 2 seleccionadas  [Emitir]│   ← la barra fija cambia de texto
 └────────────────────────┘
```
**Reglas:** casilla al inicio de la fila; atajos «Todas» y «Ninguna» como iconos; la barra fija muestra la cuenta y la acción.

### 5.6 Insignia numérica en el Inicio
**Para:** avisar pendientes sin abrir el módulo (citas de hoy, seguimientos vencidos).
**Reglas:** círculo con número en la esquina del icono; máximo «9+»; solo para cosas que requieren acción hoy; se oculta en el modo captura.

### 5.7 Aviso con «Deshacer»
**Para:** eliminar elementos de bajo riesgo (una nota, una foto) sin doble toque.
```
 Nota eliminada            [Deshacer]
```
**Reglas:** visible 6 segundos; el borrado real ocurre al cerrarse. No se usa para eliminar actividades, usuarias ni casos: esos conservan el doble toque.

### 5.8 Indicador de pendiente de envío
**Para:** mostrar qué registros aún no llegan a la nube.
**Reglas:** chip «Pendiente de enviar» en la fila, con texto y color de advertencia; desaparece al sincronizar. En Ajustes, una sola línea con el total pendiente.

### 5.9 Asistente de pasos
**Para:** altas largas (un comité con integrantes, un inventario inicial).
```
 Paso 2 de 3 · Integrantes          ✕
 ●──●──○
 [campos]
 ┌────────────────────────┐
 │ [Atrás]        [Siguiente] │
 └────────────────────────┘
```
**Reglas:** máximo 3 pasos; cada paso se guarda como borrador; solo el último paso tiene el botón de guardar.

### 5.10 Gráfica de barras sencilla
**Para:** Estadísticas e Informes en pantalla (no en el PDF oficial).
**Reglas:** barras horizontales, una serie, valor escrito al final de cada barra, sin leyendas ni ejes cuando se puede evitar. Siempre acompañada de su tabla.

---

## 6. Decisiones pendientes

1. ¿Esta guía se guarda también en el repositorio (por ejemplo `docs/reglas-de-diseno.md`) y se enlaza desde el README? Recomendado: sí, para que todo hilo nuevo la lea.
2. De los elementos de la sección 5, ¿cuáles se construyen primero? Recomendado: 5.2 (calendario compacto) y 5.1 (línea de tiempo), porque la Agenda y los casos ya los necesitan.
3. ¿Se cambia el texto de «Salir» o se mantiene? Se mantiene en esta versión.
