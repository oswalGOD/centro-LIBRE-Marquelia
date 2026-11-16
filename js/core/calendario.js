// Archivo de calendario (.ics, iCalendar RFC 5545) de un curso o actividad programada.
// Se genera en el propio dispositivo (sin internet) y abre en Calendario de Windows, Android y iPadOS/iOS.
// Las horas son «flotantes» (sin zona horaria): el evento queda a la hora local indicada en cualquier dispositivo.
// El identificador (UID) es estable: al importar de nuevo una actividad reprogramada se actualiza el mismo evento.

/** Recordatorios: un día antes y una hora antes. */
const RECORDATORIOS = [
  { disparo: "-P1D", texto: "Mañana" },
  { disparo: "-PT1H", texto: "En una hora" },
];

const escapar = t => String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Dobla las líneas a 75 octetos como exige el estándar (sin partir caracteres de varios bytes). */
function doblar(linea) {
  const codif = new TextEncoder();
  if (codif.encode(linea).length <= 75) return linea;
  const partes = [];
  let actual = "";
  let limite = 75;
  for (const ch of linea) {
    if (codif.encode(actual + ch).length > limite) {
      partes.push(actual);
      actual = "";
      limite = 74; // la línea de continuación empieza con un espacio
    }
    actual += ch;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

const fechaHora = (fecha, hora) => `${fecha.replaceAll("-", "")}T${hora.replace(":", "")}00`;
const marcaUTC = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Hora de término: la capturada; si falta, inicio + horas del curso; si no, una hora. Devuelve { fecha, hora } (puede cruzar medianoche). */
export function terminoDe(a) {
  const [h, m] = a.horaInicio.split(":").map(Number);
  let minutos = h * 60 + m + 60;
  if (a.horaFin) { const [fh, fm] = a.horaFin.split(":").map(Number); minutos = fh * 60 + fm; }
  else if (a.curso && a.horas > 0) minutos = h * 60 + m + Math.round(a.horas * 60);
  const dias = Math.floor(minutos / 1440);
  const resto = minutos % 1440;
  const f = new Date(a.fecha + "T12:00");
  f.setDate(f.getDate() + dias);
  const fecha = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
  return { fecha, hora: `${String(Math.floor(resto / 60)).padStart(2, "0")}:${String(resto % 60).padStart(2, "0")}` };
}

/** Contenido del .ics. Sin hora de inicio el evento es de todo el día. */
export function crearICS(a, ahora = new Date()) {
  const curso = Boolean(a.curso);
  const tipo = curso ? "Curso" : "Actividad";
  const descripcion = a.descripcion ?? [
    `${tipo} programad${curso ? "o" : "a"} del Centro LIBRE Marquelia.`,
    `Folio: ${a.folio}`,
    curso ? `Instructora: ${a.instructora || ""}` : `Tipo: ${a.tipo || ""}`,
    a.facilitadora ? `Facilitadora: ${a.facilitadora}` : "",
    curso && a.horas ? `Duración: ${a.horas} ${a.horas === 1 ? "hora" : "horas"}` : "",
  ].filter(Boolean).join("\n");
  const L = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//Centro LIBRE Marquelia//Agenda//ES",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${a.id}@centro-libre-marquelia`,
    `DTSTAMP:${marcaUTC(ahora)}`,
  ];
  if (a.horaInicio) {
    const fin = terminoDe(a);
    L.push(`DTSTART:${fechaHora(a.fecha, a.horaInicio)}`, `DTEND:${fechaHora(fin.fecha, fin.hora)}`);
  } else {
    const sig = new Date(a.fecha + "T12:00");
    sig.setDate(sig.getDate() + 1);
    const f = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    L.push(`DTSTART;VALUE=DATE:${a.fecha.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${f(sig)}`);
  }
  L.push(`SUMMARY:${escapar(a.nombre)}`);
  if (a.lugar) L.push(`LOCATION:${escapar(a.lugar)}`);
  L.push(`DESCRIPTION:${escapar(descripcion)}`, "STATUS:CONFIRMED", "TRANSP:OPAQUE");
  for (const r of RECORDATORIOS) {
    L.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapar(`${r.texto}: ${a.nombre}`)}`, `TRIGGER:${r.disparo}`, "END:VALARM");
  }
  L.push("END:VEVENT", "END:VCALENDAR");
  return L.map(doblar).join("\r\n") + "\r\n";
}

export const nombreICS = a => `${a.folio || "evento"}.ics`;

/**
 * Entrega el .ics: con menú de compartir (iPad, iPhone, Android) lo ofrece para abrirlo en Calendario;
 * si no existe (computadora) descarga el archivo. Debe llamarse directamente desde un toque (exigencia de iOS).
 * Devuelve "compartido", "descargado" o "cancelado".
 */
export async function agregarAlCalendario(a) {
  const archivo = new File([crearICS(a)], nombreICS(a), { type: "text/calendar" });
  if (navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: a.nombre }); return "compartido"; }
    catch (e) { if (e?.name === "AbortError") return "cancelado"; }
  }
  const url = URL.createObjectURL(archivo);
  const enlace = Object.assign(document.createElement("a"), { href: url, download: archivo.name });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "descargado";
}
