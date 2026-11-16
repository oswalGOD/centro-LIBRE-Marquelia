// Libro de Excel (.xlsx) sin librerías y sin conexión: un ZIP sin compresión con las partes mínimas del formato.
// Cada hoja es { nombre, anchos: [caracteres por columna], filas: [[celda, …]] }.
// Una celda es un número, un texto o { v: valor, e: estilo }; los estilos son "titulo", "sub", "enc", "tot" y "nota".
// Los textos se guardan como texto (nunca como fórmula), así que un valor que empiece con "=" no se ejecuta.

const ESTILOS = { titulo: 1, sub: 2, enc: 3, tot: 4, nota: 5 };

const xml = s => String(s).replace(/[&<>"\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || ""));
const letra = i => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const nombreHoja = (n, i) => (String(n).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || `Hoja ${i + 1}`);

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FF8C1D4F"/><name val="Calibri"/></font>
<font><b/><sz val="12"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF555555"/><name val="Calibri"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF8C1D4F"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1E4EA"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right><top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function xmlHoja(h) {
  const filas = h.filas.map((fila, r) => {
    const celdas = fila.map((c, i) => {
      if (c == null || c === "") return "";
      const { v, e } = typeof c === "object" ? c : { v: c };
      const s = ESTILOS[e] ? ` s="${ESTILOS[e]}"` : "";
      const ref = `${letra(i)}${r + 1}`;
      return typeof v === "number" && Number.isFinite(v)
        ? `<c r="${ref}"${s}><v>${v}</v></c>`
        : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${celdas}</row>`;
  }).join("");
  const columnas = h.anchos?.length ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>${columnas}<sheetData>${filas}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="1" fitToHeight="0"/></worksheet>`;
}

/* ---------- ZIP sin compresión ---------- */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Empaqueta archivos [{ ruta, texto }] en un ZIP sin compresión. */
export function zip(archivos) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let largo = 0;
  const poner = (b) => { partes.push(b); largo += b.length; };
  for (const a of archivos) {
    const nombre = enc.encode(a.ruta), datos = enc.encode(a.texto), crc = crc32(datos);
    const cab = new DataView(new ArrayBuffer(30));
    cab.setUint32(0, 0x04034B50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true); // bit 11: nombres UTF-8
    cab.setUint16(10, 0x6000, true); cab.setUint16(12, 0x5C21, true); // 2026-01-01 00:00 (fecha fija)
    cab.setUint32(14, crc, true); cab.setUint32(18, datos.length, true); cab.setUint32(22, datos.length, true);
    cab.setUint16(26, nombre.length, true);
    const inicio = largo;
    poner(new Uint8Array(cab.buffer)); poner(nombre); poner(datos);
    const reg = new DataView(new ArrayBuffer(46));
    reg.setUint32(0, 0x02014B50, true); reg.setUint16(4, 20, true); reg.setUint16(6, 20, true); reg.setUint16(8, 0x0800, true);
    reg.setUint16(12, 0x6000, true); reg.setUint16(14, 0x5C21, true);
    reg.setUint32(16, crc, true); reg.setUint32(20, datos.length, true); reg.setUint32(24, datos.length, true);
    reg.setUint16(28, nombre.length, true); reg.setUint32(42, inicio, true);
    central.push(new Uint8Array(reg.buffer), nombre);
  }
  const inicioCentral = largo;
  central.forEach(poner);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054B50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, largo - inicioCentral, true); fin.setUint32(16, inicioCentral, true);
  poner(new Uint8Array(fin.buffer));
  return new Blob(partes, { type: "application/zip" });
}

/** Arma el libro de Excel. Devuelve un Blob listo para descargar o compartir. */
export function libroXlsx(hojas) {
  const nombres = hojas.map((h, i) => nombreHoja(h.nombre, i));
  const base = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const archivos = [
    { ruta: "[Content_Types].xml", texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { ruta: "_rels/.rels", texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${base}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { ruta: "xl/workbook.xml", texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${base}"><sheets>${nombres.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { ruta: "xl/_rels/workbook.xml.rels", texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${base}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="${base}/styles" Target="styles.xml"/></Relationships>` },
    { ruta: "xl/styles.xml", texto: ESTILOS_XML },
    ...hojas.map((h, i) => ({ ruta: `xl/worksheets/sheet${i + 1}.xml`, texto: xmlHoja(h) })),
  ];
  const blob = zip(archivos);
  return new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
