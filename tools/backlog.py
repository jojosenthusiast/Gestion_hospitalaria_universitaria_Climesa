#!/usr/bin/env python3
"""Arma el backlog de Jira desde specs/*/tasks.md + tools/backlog_def.py.

Salidas:
  docs/gestion/backlog.json       (insumo del documento Word)
  docs/gestion/backlog.csv        (tabla plana para revisar)
  docs/gestion/jira-import.csv    (importador CSV de Jira: épicas, historias y subtareas)
Uso: python3 tools/backlog.py [--verificar]
"""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "tools"))
from backlog_def import AREAS, BE_POR_SPEC, EQUIPO, EXTRA, HISTORIAS, QA_EPICAS, QA_POR_SPEC, TAREAS  # noqa: E402
from progreso import SEMANAS, leer_specs  # noqa: E402

SALIDA = RAIZ / "docs" / "gestion"


def prioridad(nivel, semana):
    s = int(semana[1])
    if nivel == "R":
        return "Highest" if s <= 2 else "High"
    return "Medium" if s <= 4 else "Low"


PRIORIDAD_ES = {"Highest": "Crítica", "High": "Alta", "Medium": "Media", "Low": "Baja"}


def main():
    specs = leer_specs()
    errores = []
    items = []
    tareas_idx = {f"{c}-{t['id']}": (c, t) for c, s in specs.items() for t in s["tareas"]}

    # Cada tarea de spec pertenece a una sola historia
    asignadas = defaultdict(list)
    for epica, hs in HISTORIAS.items():
        for h in hs:
            for tid in h[4]:
                asignadas[tid].append(h[0])
    for tid in tareas_idx:
        if len(asignadas.get(tid, [])) != 1:
            errores.append(f"{tid} está en {len(asignadas.get(tid, []))} historias (debe ser 1)")
        if tid not in TAREAS:
            errores.append(f"{tid} sin área ni puntos en backlog_def.TAREAS")
    for tid in TAREAS:
        if tid not in tareas_idx:
            errores.append(f"{tid} en TAREAS no existe en specs")

    historia_de = {tid: hs[0] for tid, hs in asignadas.items() if hs}
    extra_idx = {e[0]: e for e in EXTRA}

    for tid, partes in TAREAS.items():
        if tid not in tareas_idx:
            continue
        codigo, t = tareas_idx[tid]
        multi = len(partes) > 1
        for parte in partes:
            area, pts = parte[0], parte[1]
            nombre_area, resp, rev = AREAS[area]
            if area == "BE" and codigo in BE_POR_SPEC:
                resp, rev = BE_POR_SPEC[codigo], "CAR"
            if area == "QA":
                resp = QA_POR_SPEC[codigo]
            if area == "DIS":
                resp = parte[2]
            items.append({
                "clave": f"{tid}-{area}" if multi else tid,
                "tarea": tid, "epica": codigo, "historia": historia_de.get(tid, "?"),
                "resumen": f"{t['titulo']}" + (f" ({nombre_area})" if multi else ""),
                "area": area, "responsable": resp, "revisor": rev, "puntos": pts,
                "nivel": t["nivel"], "sprint": t["semana"], "prioridad": prioridad(t["nivel"], t["semana"]),
                "estado": "Hecho" if t["hecha"] else "Por hacer",
                "cubre": ", ".join(t["cubre"]), "depende": ", ".join(t["depende"]) or "ninguna",
                "hecho_cuando": t["hecho_cuando"],
            })

    for e in EXTRA:
        eid, epica, sem, niv, area, resp, pts, tit, hecho = e
        items.append({
            "clave": eid, "tarea": eid, "epica": epica, "historia": historia_de.get(eid, "HU-131-1"),
            "resumen": tit, "area": area, "responsable": resp, "revisor": AREAS[area][2], "puntos": pts,
            "nivel": niv, "sprint": sem, "prioridad": prioridad(niv, sem), "estado": "Por hacer",
            "cubre": "FR-131-03" if area == "DIS" else "FR-130-06", "depende": "ninguna", "hecho_cuando": hecho,
        })

    # QA por épica de dominio: casos de prueba al inicio, prueba manual al cierre
    primera_historia = {e: hs[0][0] for e, hs in HISTORIAS.items()}
    for codigo in QA_EPICAS:
        ts = [t for t in specs[codigo]["tareas"] if t["nivel"] == "R"]
        ini = min(int(t["semana"][1]) for t in ts)
        fin = min(5, max(int(t["semana"][1]) for t in ts))
        titulo = specs[codigo]["titulo"]
        for sufijo, sem, pts, tit, hecho in [
            ("casos", f"S{max(ini, 2) if ini < 2 else ini}", 2, f"Casos de prueba de {titulo}",
             "Un caso por escenario de aceptación de la spec, con datos ficticios y resultado esperado"),
            ("manual", f"S{fin}", 3, f"Prueba manual de {titulo} en las plataformas",
             "Casos ejecutados en web, Android e iOS según corresponda; defectos reportados en Jira"),
        ]:
            items.append({
                "clave": f"QA-{codigo}-{sufijo}", "tarea": f"QA-{codigo}-{sufijo}", "epica": codigo,
                "historia": primera_historia[codigo], "resumen": tit, "area": "QA",
                "responsable": QA_POR_SPEC[codigo], "revisor": "CAR", "puntos": pts, "nivel": "R",
                "sprint": sem, "prioridad": prioridad("R", sem), "estado": "Por hacer",
                "cubre": "spec " + codigo, "depende": "ninguna", "hecho_cuando": hecho,
            })

    # Historias y épicas
    historias = []
    for codigo, hs in HISTORIAS.items():
        for h in hs:
            hid, como, quiero, para, tids, criterios = h
            subs = [i for i in items if i["historia"] == hid]
            if not subs:
                errores.append(f"{hid} sin subtareas")
                continue
            historias.append({
                "clave": hid, "epica": codigo, "como": como, "quiero": quiero, "para": para,
                "criterios": criterios, "puntos": sum(i["puntos"] for i in subs),
                "sprint": min(i["sprint"] for i in subs),
                "prioridad": min((i["prioridad"] for i in subs), key=["Highest", "High", "Medium", "Low"].index),
                "estado": "Hecho" if all(i["estado"] == "Hecho" for i in subs) else "Por hacer",
            })
    epicas = [{"clave": c, "titulo": s["titulo"], "carpeta": s["carpeta"], "estado_spec": s["estado"]} for c, s in specs.items()]

    datos = {"equipo": EQUIPO, "areas": {k: v[0] for k, v in AREAS.items()}, "semanas": SEMANAS,
             "epicas": epicas, "historias": historias, "items": items, "prioridad_es": PRIORIDAD_ES}

    # Pivote
    piv = defaultdict(lambda: defaultdict(int))
    for i in items:
        piv[i["responsable"]][i["sprint"]] += i["puntos"]
    print("Puntos por persona y sprint")
    for p in EQUIPO:
        fila = [piv[p].get(f"S{n}", 0) for n in range(1, 6)]
        print(f"  {p}: {fila} total {sum(fila)}")
    print(f"{len(epicas)} épicas, {len(historias)} historias, {len(items)} subtareas, {sum(i['puntos'] for i in items)} puntos")

    if "--verificar" not in sys.argv:
        SALIDA.mkdir(parents=True, exist_ok=True)
        (SALIDA / "backlog.json").write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
        cols = ["clave", "epica", "historia", "resumen", "area", "responsable", "revisor", "puntos", "prioridad",
                "sprint", "nivel", "estado", "cubre", "depende", "hecho_cuando"]
        with open(SALIDA / "backlog.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            w.writerows(items)
        # Importador CSV de Jira (Issue Id y Parent Id enlazan jerarquía; Sprint por nombre)
        with open(SALIDA / "jira-import.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["Issue Id", "Parent Id", "Issue Type", "Summary", "Description", "Story Points", "Priority",
                        "Sprint", "Labels", "Assignee", "Status"])
            ids = {}
            n = 1
            for e in epicas:
                ids[e["clave"]] = n
                w.writerow([n, "", "Epic", f"{e['clave']} {e['titulo']}", f"Spec: specs/{e['carpeta']}/spec.md", "", "High", "",
                            f"spec-{e['clave']}", "", "To Do"])
                n += 1
            for h in historias:
                ids[h["clave"]] = n
                desc = f"Como {h['como']}, quiero {h['quiero']}, para {h['para']}.\n\nCriterios de aceptación:\n" + \
                       "\n".join(f"- {c}" for c in h["criterios"])
                w.writerow([n, ids[h["epica"]], "Story", f"{h['clave']} {h['quiero'][0].upper()}{h['quiero'][1:]}", desc,
                            h["puntos"], h["prioridad"], f"Sprint {h['sprint'][1]}", f"spec-{h['epica']}", "",
                            "Done" if h["estado"] == "Hecho" else "To Do"])
                n += 1
            for i in items:
                desc = (f"Cubre: {i['cubre']}\nDepende de: {i['depende']}\nHecho cuando: {i['hecho_cuando']}\n"
                        f"Revisa: {EQUIPO[i['revisor']][0]}")
                w.writerow([n, ids[i["historia"]], "Subtask", f"{i['clave']} {i['resumen']}", desc, i["puntos"],
                            i["prioridad"], f"Sprint {i['sprint'][1]}", f"spec-{i['epica']} area-{i['area']} nivel-{i['nivel']}",
                            EQUIPO[i["responsable"]][0], "Done" if i["estado"] == "Hecho" else "To Do"])
                n += 1
    for e in errores:
        print("ERROR:", e)
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()
