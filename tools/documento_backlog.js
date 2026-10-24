// Genera docs/gestion/Backlog-Jira-SGHU.docx desde docs/gestion/backlog.json (tools/backlog.py).
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  HeadingLevel, PageOrientation, LevelFormat, BorderStyle, Footer, PageNumber, TableOfContents, PageBreak,
} = require("docx");

const RAIZ = path.resolve(__dirname, "..");
const D = JSON.parse(fs.readFileSync(path.join(RAIZ, "docs/gestion/backlog.json"), "utf8"));
const OUT = path.join(RAIZ, "docs/gestion/Backlog-Jira-SGHU.docx");

const FONT = "Arial";
const C = { ink: "122028", muted: "4E616B", primary: "0A6C70", soft: "E3F2F1", head: "DCE8EA", border: "C9D5D9", done: "E4F3EA" };
const ANCHO = 12960; // carta horizontal con márgenes de 1 pulgada: 15840 - 2*1440
const nombre = (k) => D.equipo[k][0];
const pES = (p) => D.prioridad_es[p];

const borde = { style: BorderStyle.SINGLE, size: 4, color: C.border };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };

function p(text, opts = {}) {
  return new Paragraph({ spacing: { after: opts.after ?? 120 }, alignment: opts.align, children: [
    new TextRun({ text, bold: opts.bold, color: opts.color, size: opts.size, italics: opts.italics }) ] });
}
function runs(parts, opts = {}) {
  return new Paragraph({ spacing: { after: opts.after ?? 120 }, children: parts.map(([t, b]) => new TextRun({ text: t, bold: !!b })) });
}
function bullet(text) {
  return new Paragraph({ numbering: { reference: "vinetas", level: 0 }, spacing: { after: 60 }, children: [new TextRun(text)] });
}
function celda(text, w, o = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: bordes,
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ alignment: o.align, children: [new TextRun({ text: String(text), bold: o.bold, size: o.size ?? 18, color: o.color })] })],
  });
}
function tabla(cols, filas, opts = {}) {
  const total = cols.reduce((a, c) => a + c[1], 0);
  const ws = cols.map((c) => Math.round((c[1] * ANCHO) / total));
  ws[ws.length - 1] += ANCHO - ws.reduce((a, b) => a + b, 0);
  const head = new TableRow({ tableHeader: true, children: cols.map((c, i) => celda(c[0], ws[i], { bold: true, fill: C.head, align: c[2] })) });
  const body = filas.map((f) => new TableRow({ children: f.cells.map((v, i) => celda(v, ws[i], { align: cols[i][2], fill: f.fill, bold: f.bold })) }));
  return new Table({ width: { size: ANCHO, type: WidthType.DXA }, columnWidths: ws, rows: [head, ...body] });
}
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });

const items = D.items;
const personas = Object.keys(D.equipo);
const sprints = ["S1", "S2", "S3", "S4", "S5"];
const suma = (arr) => arr.reduce((a, i) => a + i.puntos, 0);
const R = AlignmentType.RIGHT, CEN = AlignmentType.CENTER;

const hijos = [];

// Portada
hijos.push(
  new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: "Sistema de Gestión Hospitalaria Universitaria (CLIMESA)", size: 28, color: C.primary, bold: true })] }),
  new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Backlog para Jira: épicas, historias, tareas, puntos y responsables", size: 44, bold: true, color: C.ink })] }),
  p("Proyecto Final de Desarrollo de Aplicaciones Móviles Avanzadas · 17 de octubre a 21 de noviembre de 2026", { color: C.muted, size: 24 }),
  p(`${D.epicas.length} épicas · ${D.historias.length} historias de usuario · ${items.length} subtareas · ${suma(items)} puntos de historia`, { color: C.muted, size: 24, after: 600 }),
  p("Fuente: specs/*/tasks.md y tools/backlog_def.py del repositorio. Este documento se regenera con tools/backlog.py y tools/documento_backlog.js; los cambios se hacen en esas fuentes, no a mano aquí.", { italics: true, color: C.muted }),
  new Paragraph({ children: [new PageBreak()] }),
  new TableOfContents("Contenido", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({ children: [new PageBreak()] }),
);

// 1. Equipo
hijos.push(h1("1. Equipo y responsabilidades"));
const desc = {
  CAR: "Dirige el tablero y las ceremonias. Construye la API base, la base de datos y los módulos de plataforma, acceso, pacientes, edificio, consulta, hospitalización, ambulancia y privacidad. Revisa el frontend web y todo lo de QA.",
  LEO: "Construye la web en React y la base de front compartida (cliente de API, tiempo real, integración continua). Toma el backend de turnos, fila y citas, laboratorio, inventario, público y métricas. Revisa backend de Carlos, Android, iOS y diseño.",
  FER: "Construye la app Android en Kotlin con Compose y MVVM para los siete roles móviles.",
  MIL: "Construye la app iOS en SwiftUI con MVVM para médico y paciente.",
  WAL: "Pruebas y QA, prototipos web e iOS en Figma, datos ficticios de prueba, accesibilidad.",
  ANG: "Pruebas y QA, prototipos Android y flujos en Figma, plantillas de casos y defectos, armado del PDF de arquitectura.",
};
hijos.push(tabla([["Persona", 14], ["Rol", 26], ["Qué hace en este proyecto", 60]],
  personas.map((k) => ({ cells: [nombre(k), D.equipo[k][1], desc[k]] }))));
hijos.push(p(""), p("Regla de revisión: nadie aprueba su propia subtarea. Backend lo revisa Leonel (y Carlos revisa el backend que hace Leonel); web la revisa Carlos; Android, iOS y diseño los revisa Leonel; QA y documentación los revisa Carlos.", {}));

// 2. Reglas del tablero
hijos.push(h1("2. Cómo se usa el tablero"));
hijos.push(h2("Sprints"));
hijos.push(tabla([["Sprint", 10], ["Fechas", 18], ["Meta del sprint", 72]], [
  { cells: ["Sprint 1", D.semanas.S1, "Planificación y diseño: base de datos en la nube (ya aplicada), API base, sistema de diseño, prototipos iniciales, proyectos de las tres apps"] },
  { cells: ["Sprint 2", D.semanas.S2, "Avance del 31 de octubre: login y registro por rol, navegación en Android e iOS, CRUD de pacientes y personal, tablero web, Figma al 100%"] },
  { cells: ["Sprint 3", D.semanas.S3, "Consulta general, laboratorio, fila del día y citas, turnos, información pública"] },
  { cells: ["Sprint 4", D.semanas.S4, "Asignación de camas, ambulancia, privacidad, inventario"] },
  { cells: ["Sprint 5", D.semanas.S5, "Integración de las tres plataformas, pruebas de concurrencia, push, pulido, PDF y ensayo de la defensa"] },
]));
hijos.push(h2("Puntos, prioridad y estados"));
hijos.push(bullet("Puntos en escala Fibonacci (1, 2, 3, 5, 8): 1 es menos de medio día de trabajo enfocado; 8 es casi una semana de una persona y debería partirse."));
hijos.push(bullet("Prioridad Crítica: exigida por el curso y necesaria para el avance del 31 de octubre (sprints 1 y 2)."));
hijos.push(bullet("Prioridad Alta: exigida por el curso para la entrega final. Media: extra de alto valor del sprint 3 o 4. Baja: extra del sprint 5."));
hijos.push(bullet("Estados: Por hacer → En curso → En revisión → Hecho. Una subtarea pasa a Hecho solo cuando se cumple su \"Hecho cuando\" y el revisor lo aprueba."));
hijos.push(bullet("Cada subtarea cita los requisitos que cubre (FR-xxx-yy) y su spec; el detalle está en specs/<número>/spec.md."));
hijos.push(h2("Definición de listo y de hecho"));
hijos.push(bullet("Lista para empezar: la spec está en revisión o aprobada, sus dependencias están hechas y el diseño de sus pantallas existe en Figma."));
hijos.push(bullet("Hecha: código en la rama principal mediante PR revisado, prueba automática cuando aplica, verificación anotada en tasks.md y caso de prueba manual ejecutado por QA."));
hijos.push(h2("Ceremonias (las dirige Carlos)"));
hijos.push(bullet("Planificación: sábado al iniciar cada sprint, 45 minutos, con este documento y el tablero."));
hijos.push(bullet("Seguimiento diario: 10 minutos por chat o llamada (qué hice, qué haré, qué me bloquea)."));
hijos.push(bullet("Revisión y retrospectiva: viernes al cerrar el sprint, con demostración de lo hecho y del avance en specs/ESTADO.md."));

// 3. Pivote
hijos.push(h1("3. Tabla pivote de carga"));
hijos.push(h2("Puntos por persona y sprint"));
const filasPiv = personas.map((k) => {
  const vals = sprints.map((s) => suma(items.filter((i) => i.responsable === k && i.sprint === s)));
  return { cells: [nombre(k), ...vals, vals.reduce((a, b) => a + b, 0)] };
});
const totS = sprints.map((s) => suma(items.filter((i) => i.sprint === s)));
filasPiv.push({ cells: ["Total", ...totS, totS.reduce((a, b) => a + b, 0)], bold: true, fill: C.soft });
hijos.push(tabla([["Persona", 20], ["Sprint 1", 13, R], ["Sprint 2", 13, R], ["Sprint 3", 13, R], ["Sprint 4", 13, R], ["Sprint 5", 13, R], ["Total", 15, R]], filasPiv));
hijos.push(p(""));
hijos.push(h2("Puntos por persona y área"));
const areas = Object.keys(D.areas);
const filasArea = personas.map((k) => {
  const vals = areas.map((a) => suma(items.filter((i) => i.responsable === k && i.area === a)));
  return { cells: [nombre(k), ...vals.map((v) => v || "·")] };
});
hijos.push(tabla([["Persona", 16], ...areas.map((a) => [D.areas[a], 12, R])], filasArea));
hijos.push(p(""));
hijos.push(h2("Puntos por prioridad y persona"));
const prios = ["Highest", "High", "Medium", "Low"];
hijos.push(tabla([["Persona", 20], ...prios.map((x) => [pES(x), 20, R])],
  personas.map((k) => ({ cells: [nombre(k), ...prios.map((x) => suma(items.filter((i) => i.responsable === k && i.prioridad === x)) || "·")] }))));
hijos.push(p(""));
hijos.push(h2("Lectura de la carga"));
hijos.push(bullet("Carlos y Leonel llevan la mayor carga porque son el núcleo: el backend de seis módulos pasó a Leonel para que ninguno supere al otro por mucho. Las 12 tareas de base de datos del sprint 1 ya están hechas y aplicadas en Supabase."));
hijos.push(bullet("Fernando tiene el sprint 4 cargado (admisión, ambulancia y paramédico en Android). Milton tiene menos carga porque iOS solo cubre médico y paciente: si va adelantado, apoya a Fernando en las pantallas del paciente en Android, que son las mismas que ya construyó en iOS."));
hijos.push(bullet("Walter y Ángel concentran el diseño en los sprints 1 y 2 (Figma al 100% para el avance) y las pruebas en los sprints 3 a 5. No tienen tareas de código."));

// 4. Avance
hijos.push(h1("4. Lo que debe estar listo para el 31 de octubre"));
hijos.push(p("Subtareas de prioridad Crítica (sprints 1 y 2), por persona. Las marcadas como hechas ya se completaron."));
for (const k of personas) {
  const xs = items.filter((i) => i.responsable === k && i.prioridad === "Highest");
  if (!xs.length) continue;
  hijos.push(h3(`${nombre(k)} · ${suma(xs)} puntos`));
  hijos.push(tabla([["Clave", 14], ["Subtarea", 56], ["Pts", 6, R], ["Sprint", 8, CEN], ["Estado", 16]],
    xs.map((i) => ({ cells: [i.clave, i.resumen, i.puntos, i.sprint, i.estado], fill: i.estado === "Hecho" ? C.done : undefined }))));
}

// 5. Backlog por épica
hijos.push(h1("5. Backlog por épica"));
for (const e of D.epicas) {
  const hs = D.historias.filter((h) => h.epica === e.clave);
  const xs = items.filter((i) => i.epica === e.clave);
  hijos.push(h2(`Épica ${e.clave} · ${e.titulo}`));
  hijos.push(runs([["Spec: ", true], [`specs/${e.carpeta}/spec.md`], ["   Estado de la spec: ", true], [e.estado_spec], ["   Puntos: ", true], [String(suma(xs))]]));
  for (const h of hs) {
    hijos.push(h3(`${h.clave} · ${pES(h.prioridad)} · ${h.puntos} ${h.puntos === 1 ? "punto" : "puntos"} · desde ${h.sprint.replace("S", "Sprint ")}`));
    hijos.push(runs([["Como ", false], [h.como, true], [", quiero ", false], [h.quiero, true], [", para ", false], [h.para + ".", true]]));
    hijos.push(p("Criterios de aceptación:", { bold: true, after: 60 }));
    h.criterios.forEach((c) => hijos.push(bullet(c)));
    const subs = items.filter((i) => i.historia === h.clave);
    hijos.push(tabla([["Clave", 11], ["Subtarea", 33], ["Responsable", 9], ["Revisa", 8], ["Pts", 4, R], ["Prioridad", 8], ["Sprint", 6, CEN], ["Hecho cuando", 21]],
      subs.map((i) => ({ cells: [i.clave, i.resumen, nombre(i.responsable), nombre(i.revisor), i.puntos, pES(i.prioridad), i.sprint, i.hecho_cuando],
        fill: i.estado === "Hecho" ? C.done : undefined }))));
    hijos.push(p(""));
  }
}

// 6. Importar en Jira
hijos.push(h1("6. Cómo cargarlo en Jira"));
hijos.push(bullet("Archivo: docs/gestion/jira-import.csv (épicas, historias y subtareas enlazadas con Issue Id y Parent Id)."));
hijos.push(bullet("En Jira: Configuración del proyecto o Sistema > Importación externa > CSV. Mapear Issue Id, Parent Id, Issue Type, Summary, Description, Story Points, Priority, Sprint, Labels, Assignee y Status."));
hijos.push(bullet("Crear antes los sprints \"Sprint 1\" a \"Sprint 5\" y las cuentas de los seis integrantes para que se asignen solas."));
hijos.push(bullet("Si el importador no acepta Subtask en un proyecto gestionado por el equipo, importar las subtareas como Task con la historia como padre."));

const doc = new Document({
  creator: "Equipo SGHU", title: "Backlog para Jira SGHU",
  styles: {
    default: { document: { run: { font: FONT, size: 20, color: C.ink } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: C.primary }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: C.ink }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: FONT, color: C.primary }, paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [{ reference: "vinetas", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
      margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
      new TextRun({ text: "Backlog SGHU · página ", size: 16, color: C.muted }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C.muted })] })] }) },
    children: hijos,
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log("escrito", path.relative(RAIZ, OUT), b.length, "bytes"); });
