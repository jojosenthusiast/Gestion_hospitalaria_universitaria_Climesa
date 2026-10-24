#!/usr/bin/env python3
"""Estado del SDD: lee specs/*/spec.md y tasks.md y genera specs/ESTADO.md (el CSV de Jira lo genera tools/backlog.py).

Además verifica la trazabilidad:
  - cada tarea cubre requisitos que existen en alguna spec;
  - cada dependencia apunta a una tarea existente (Tnn de la misma spec o NNN-Tnn de otra);
  - cada requisito de una spec está cubierto por al menos una tarea;
  - cada requisito del curso (REQ-xxx en docs/curso/requisitos-dama.md) aparece como origen de algún requisito de spec.

Uso:  python3 tools/progreso.py              (escribe ESTADO.md)
      python3 tools/progreso.py --verificar  (solo verifica; código 1 si hay errores o ESTADO.md no está al día)
"""
import csv
import io
import re
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SPECS = RAIZ / "specs"
REQS_CURSO = RAIZ / "docs" / "curso" / "requisitos-dama.md"

SEMANAS = {
    "S1": "17 a 23 oct",
    "S2": "24 a 30 oct",
    "S3": "31 oct a 6 nov",
    "S4": "7 a 13 nov",
    "S5": "14 a 20 nov",
    "S6": "21 nov",
}

RE_TAREA = re.compile(r"^- \[( |x)\] (T\d+) · (S\d) · ([REF]) · (.+)$")
RE_FR = re.compile(r"^\| (FR-\d{3}-\d{2}) \| (.+?) \| ([REF]) \| (.+?) \|$")
RE_ESTADO = re.compile(r"\*\*Estado:\*\* ([^·]+)")
RE_TITULO = re.compile(r"^# (\d{3})\. (.+)$")


def expandir(texto):
    """Convierte 'FR-105-01 a FR-105-04' en la lista completa."""
    resultado = []
    for parte in [p.strip() for p in texto.split(",") if p.strip()]:
        m = re.match(r"(FR-\d{3}-)(\d{2}) a FR-\d{3}-(\d{2})$", parte)
        if m:
            resultado += [f"{m.group(1)}{n:02d}" for n in range(int(m.group(2)), int(m.group(3)) + 1)]
        else:
            resultado.append(parte)
    return resultado


def leer_specs():
    specs = {}
    for carpeta in sorted(p for p in SPECS.iterdir() if p.is_dir() and re.match(r"\d{3}-", p.name)):
        spec_txt = (carpeta / "spec.md").read_text(encoding="utf-8")
        titulo = RE_TITULO.search(spec_txt.splitlines()[0])
        estado = RE_ESTADO.search(spec_txt)
        frs = {}
        for linea in spec_txt.splitlines():
            m = RE_FR.match(linea)
            if m:
                frs[m.group(1)] = {"texto": m.group(2), "nivel": m.group(3), "origen": m.group(4)}
        tareas = []
        actual = None
        for linea in (carpeta / "tasks.md").read_text(encoding="utf-8").splitlines():
            m = RE_TAREA.match(linea)
            if m:
                actual = {
                    "hecha": m.group(1) == "x",
                    "id": m.group(2),
                    "semana": m.group(3),
                    "nivel": m.group(4),
                    "titulo": m.group(5),
                    "cubre": [],
                    "depende": [],
                    "hecho_cuando": "",
                }
                tareas.append(actual)
            elif actual and linea.strip().startswith("- Cubre:"):
                actual["cubre"] = expandir(linea.split(":", 1)[1])
            elif actual and linea.strip().startswith("- Depende de:"):
                valor = linea.split(":", 1)[1].strip()
                actual["depende"] = [] if valor == "ninguna" else [v.strip() for v in valor.split(",")]
            elif actual and linea.strip().startswith("- Hecho cuando:"):
                actual["hecho_cuando"] = linea.split(":", 1)[1].strip()
        codigo = carpeta.name[:3]
        specs[codigo] = {
            "carpeta": carpeta.name,
            "titulo": titulo.group(2) if titulo else carpeta.name,
            "estado": estado.group(1).strip() if estado else "?",
            "frs": frs,
            "tareas": tareas,
        }
    return specs


def verificar(specs):
    errores = []
    todos_fr = {fr for s in specs.values() for fr in s["frs"]}
    todas_tareas = {f"{c}-{t['id']}" for c, s in specs.items() for t in s["tareas"]}
    cubiertos = set()
    for codigo, s in specs.items():
        ids = [t["id"] for t in s["tareas"]]
        if len(ids) != len(set(ids)):
            errores.append(f"{codigo}: IDs de tarea repetidos")
        for t in s["tareas"]:
            if not t["cubre"]:
                errores.append(f"{codigo}-{t['id']}: no cubre ningún requisito")
            for fr in t["cubre"]:
                if fr not in todos_fr:
                    errores.append(f"{codigo}-{t['id']}: cubre {fr}, que no existe")
                cubiertos.add(fr)
            for dep in t["depende"]:
                ref = dep if "-" in dep else f"{codigo}-{dep}"
                if ref not in todas_tareas:
                    errores.append(f"{codigo}-{t['id']}: depende de {dep}, que no existe")
            if not t["hecho_cuando"]:
                errores.append(f"{codigo}-{t['id']}: falta 'Hecho cuando'")
    for codigo, s in specs.items():
        for fr in s["frs"]:
            if fr not in cubiertos:
                errores.append(f"{fr}: ninguna tarea lo cubre")
    reqs = sorted(set(re.findall(r"REQ-[A-Z]{3}-\d{2}", REQS_CURSO.read_text(encoding="utf-8"))))
    origenes = " ".join(fr["origen"] for s in specs.values() for fr in s["frs"].values())
    for req in reqs:
        base = req.rsplit("-", 1)[0]
        num = int(req.rsplit("-", 1)[1])
        rango = any(
            int(a) <= num <= int(b)
            for a, b in re.findall(base + r"-(\d{2}) a (\d{2})", origenes)
        ) or any(
            int(a) <= num <= int(b)
            for a, b in re.findall(base + r"-(\d{2}), (\d{2})", origenes)
        )
        if req not in origenes and not rango:
            errores.append(f"{req} (curso): ninguna spec lo usa como origen")
    return errores


def ciclos(specs):
    grafo = defaultdict(list)
    for codigo, s in specs.items():
        for t in s["tareas"]:
            for dep in t["depende"]:
                grafo[f"{codigo}-{t['id']}"].append(dep if "-" in dep else f"{codigo}-{dep}")
    visitando, hecho, errores = set(), set(), []

    def dfs(n, ruta):
        if n in visitando:
            errores.append("Ciclo de dependencias: " + " -> ".join(ruta + [n]))
            return
        if n in hecho:
            return
        visitando.add(n)
        for m in grafo[n]:
            dfs(m, ruta + [n])
        visitando.discard(n)
        hecho.add(n)

    for n in list(grafo):
        dfs(n, [])
    return errores


def semana_vs_dependencias(specs):
    """Una tarea no puede depender de otra planificada en una semana posterior."""
    semana = {f"{c}-{t['id']}": int(t["semana"][1]) for c, s in specs.items() for t in s["tareas"]}
    avisos = []
    for c, s in specs.items():
        for t in s["tareas"]:
            for dep in t["depende"]:
                ref = dep if "-" in dep else f"{c}-{dep}"
                if ref in semana and semana[ref] > int(t["semana"][1]):
                    avisos.append(f"{c}-{t['id']} ({t['semana']}) depende de {ref} (S{semana[ref]}), planificada después")
    return avisos


def barra(hechas, total, ancho=10):
    if total == 0:
        return "·" * ancho
    llenas = round(ancho * hechas / total)
    return "█" * llenas + "░" * (ancho - llenas)


def generar_estado(specs, errores, avisos):
    lineas = [
        "# Estado del proyecto",
        "",
        "> Generado por `tools/progreso.py` desde `specs/*/tasks.md`. No editar a mano.",
        "",
    ]
    total = sum(len(s["tareas"]) for s in specs.values())
    hechas = sum(t["hecha"] for s in specs.values() for t in s["tareas"])
    frs = sum(len(s["frs"]) for s in specs.values())
    lineas += [
        f"**Tareas:** {hechas} de {total} ({100 * hechas // max(total, 1)}%) · **Requisitos:** {frs} · **Specs:** {len(specs)}",
        "",
        "## Por spec",
        "",
        "| Spec | Estado | Requisitos R/E/F | Tareas | Avance |",
        "|---|---|---|---|---|",
    ]
    for codigo, s in specs.items():
        niveles = defaultdict(int)
        for fr in s["frs"].values():
            niveles[fr["nivel"]] += 1
        h = sum(t["hecha"] for t in s["tareas"])
        n = len(s["tareas"])
        lineas.append(
            f"| [{codigo} {s['titulo']}](./{s['carpeta']}/spec.md) | {s['estado']} | {niveles['R']}/{niveles['E']}/{niveles['F']} | {h}/{n} | {barra(h, n)} |"
        )
    lineas += ["", "## Por semana", "", "| Semana | Fechas | R hechas | E hechas | Total |", "|---|---|---|---|---|"]
    for sem, fechas in SEMANAS.items():
        ts = [t for s in specs.values() for t in s["tareas"] if t["semana"] == sem]
        if not ts:
            continue
        r = [t for t in ts if t["nivel"] == "R"]
        e = [t for t in ts if t["nivel"] == "E"]
        lineas.append(
            f"| {sem} | {fechas} | {sum(t['hecha'] for t in r)}/{len(r)} | {sum(t['hecha'] for t in e)}/{len(e)} | {barra(sum(t['hecha'] for t in ts), len(ts))} |"
        )
    lineas += ["", "## Para el avance del 31 de octubre (tareas R de S1 y S2)", ""]
    for codigo, s in specs.items():
        for t in s["tareas"]:
            if t["semana"] in ("S1", "S2") and t["nivel"] == "R":
                marca = "x" if t["hecha"] else " "
                lineas.append(f"- [{marca}] {codigo}-{t['id']} · {t['titulo']}")
    lineas += ["", "## Verificación de trazabilidad", ""]
    if errores:
        lineas += [f"- ERROR: {e}" for e in errores]
    else:
        lineas.append("Sin errores: toda tarea cubre requisitos existentes, toda dependencia existe, todo requisito tiene tarea y todo requisito del curso está en alguna spec.")
    if avisos:
        lineas += ["", "Avisos de planificación:", ""] + [f"- {a}" for a in avisos]
    return "\n".join(lineas) + "\n"


def generar_jira(specs):
    salida = io.StringIO()
    w = csv.writer(salida)
    w.writerow(["Issue Type", "Summary", "Description", "Epic Name", "Epic Link", "Labels", "Status", "Sprint"])
    for codigo, s in specs.items():
        epica = f"{codigo} {s['titulo']}"
        w.writerow(["Epic", epica, f"Spec: specs/{s['carpeta']}/spec.md", epica, "", f"spec-{codigo}", "", ""])
        for t in s["tareas"]:
            desc = f"Cubre: {', '.join(t['cubre'])}\nDepende de: {', '.join(t['depende']) or 'ninguna'}\nHecho cuando: {t['hecho_cuando']}"
            w.writerow([
                "Task",
                f"{codigo}-{t['id']} {t['titulo']}",
                desc,
                "",
                epica,
                f"spec-{codigo} nivel-{t['nivel']}",
                "Done" if t["hecha"] else "To Do",
                f"Sprint {t['semana'][1]}",
            ])
    return salida.getvalue()


def main():
    specs = leer_specs()
    errores = verificar(specs) + ciclos(specs)
    avisos = semana_vs_dependencias(specs)
    estado = generar_estado(specs, errores, avisos)
    jira = generar_jira(specs)
    if "--verificar" in sys.argv:
        actual = (SPECS / "ESTADO.md").read_text(encoding="utf-8") if (SPECS / "ESTADO.md").exists() else ""
        if actual != estado:
            errores.append("specs/ESTADO.md no está al día: ejecutar tools/progreso.py")
    else:
        (SPECS / "ESTADO.md").write_text(estado, encoding="utf-8")
    total = sum(len(s["tareas"]) for s in specs.values())
    print(f"{len(specs)} specs, {sum(len(s['frs']) for s in specs.values())} requisitos, {total} tareas")
    for a in avisos:
        print("AVISO:", a)
    for e in errores:
        print("ERROR:", e)
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()
