#!/usr/bin/env python3
"""Arma el backlog de Jira desde specs/*/tasks.md + tools/backlog_def.py.

Reglas (D-076): story points solo en historias, relativos a la pivote HU-102-1 = 3.
Subtareas por componente, sin puntos y sin persona asignada.

Salidas:
  docs/gestion/backlog.json       (insumo del documento Word)
  docs/gestion/backlog.csv        (tabla plana de historias y subtareas)
  docs/gestion/jira-import.csv    (importador CSV de Jira: épicas, historias y subtareas)
Uso: python3 tools/backlog.py [--verificar] [--sincronizar]
  --sincronizar  copia el sprint de cada historia a sus tareas en specs/*/tasks.md
"""
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "tools"))
import backlog_def as B  # noqa: E402
from progreso import leer_specs  # noqa: E402

SALIDA = RAIZ / "docs" / "gestion"
ORDEN_P = ["Highest", "High", "Medium", "Low", "Lowest"]
FIB = {1, 2, 3, 5, 8}
CLIENTES = {"WEB", "AND", "IOS"}
NOMBRE_COMP = {"BE": "Backend", "WEB": "Web", "AND": "Android", "IOS": "iOS", "QA": "QA", "DIS": "Diseño", "DOC": "Documentación"}


def sincronizar(specs, sprint_de_tarea):
    cambios = 0
    for codigo, s in specs.items():
        ruta = RAIZ / "specs" / s["carpeta"] / "tasks.md"
        lineas = ruta.read_text(encoding="utf-8").splitlines(keepends=True)
        for i, l in enumerate(lineas):
            m = re.match(r"^- \[( |x)\] (T\d+) · (S\d) · ", l)
            if not m or m.group(1) == "x":
                continue
            nuevo = sprint_de_tarea.get(f"{codigo}-{m.group(2)}")
            nuevo = "S5" if nuevo == "BL" else nuevo
            if nuevo and nuevo != m.group(3):
                lineas[i] = l.replace(f"· {m.group(3)} ·", f"· {nuevo} ·", 1)
                cambios += 1
        ruta.write_text("".join(lineas), encoding="utf-8")
    print(f"tasks.md sincronizados: {cambios} tareas cambiaron de sprint")


def main():
    specs = leer_specs()
    errores, avisos = [], []
    tareas_idx = {f"{c}-{t['id']}": (c, t) for c, s in specs.items() for t in s["tareas"]}
    tareas_f = {k for k, (c, t) in tareas_idx.items() if t["nivel"] == "F"}

    # Cada tarea de spec (R y E) y cada extra pertenece a una sola historia
    dueño = defaultdict(list)
    for h in B.H:
        for tid in h[5]:
            dueño[tid].append(h[0])
    for tid in list(tareas_idx) + list(B.EXTRA):
        if tid in tareas_f:
            continue
        if len(dueño.get(tid, [])) != 1:
            errores.append(f"{tid} está en {len(dueño.get(tid, []))} historias (debe ser 1)")
    for tid in dueño:
        if tid not in tareas_idx and tid not in B.EXTRA:
            errores.append(f"{tid} citado en una historia no existe")
    for tid in tareas_idx:
        if tid not in tareas_f and tid not in B.TAREAS:
            errores.append(f"{tid} sin componentes en backlog_def.TAREAS")

    historias, subtareas = [], []
    sprint_de_tarea = {}
    ids_hist = set()
    for h in B.H:
        hid, epica, como, quiero, para, tids, pts, prio, sprint, pantallas, criterios = h
        if hid in ids_hist:
            errores.append(f"{hid} repetida")
        ids_hist.add(hid)
        if pts not in FIB:
            errores.append(f"{hid}: {pts} puntos no está en la escala (1, 2, 3, 5, 8; 13 se parte)")
        if prio not in ORDEN_P[:4]:
            errores.append(f"{hid}: prioridad {prio} no válida")
        if epica not in specs:
            errores.append(f"{hid}: épica {epica} no existe")
        subs, comps, frs = [], set(), set()
        for tid in tids:
            if tid in B.EXTRA:
                comp, titulo, hecho, listo = B.EXTRA[tid]
                partes = [(tid, comp, titulo, hecho, listo, "", "ninguna", "R")]
            else:
                if tid not in tareas_idx:
                    continue
                codigo, t = tareas_idx[tid]
                sprint_de_tarea[tid] = sprint
                cs = B.TAREAS.get(tid, ["BE"])
                partes = [(f"{tid}-{c}" if len(cs) > 1 else tid, c,
                           t["titulo"] + (f" ({NOMBRE_COMP[c]})" if len(cs) > 1 else ""),
                           t["hecho_cuando"], t["hecha"], ", ".join(t["cubre"]),
                           ", ".join(t["depende"]) or "ninguna", t["nivel"]) for c in cs]
                frs.update(t["cubre"])
            for clave, comp, titulo, hecho, listo, cubre, dep, nivel in partes:
                comps.add(comp)
                subs.append({"clave": clave, "historia": hid, "epica": epica, "componente": comp, "resumen": titulo,
                             "hecho_cuando": hecho, "estado": "Hecho" if listo else "Por hacer", "cubre": cubre,
                             "depende": dep, "nivel": nivel, "sprint": sprint})
        # Subtarea de QA automática para historias con pantallas o API que no son de calidad o documentación
        if epica not in ("130", "131") and "QA" not in comps:
            plats = sorted(comps & CLIENTES, key=["WEB", "AND", "IOS"].index)
            donde = ", ".join(NOMBRE_COMP[c] for c in plats) or "API (Postman o Swagger)"
            hecho_qa = all(s["estado"] == "Hecho" for s in subs)
            subs.append({"clave": f"{hid}-QA", "historia": hid, "epica": epica, "componente": "QA",
                         "resumen": f"Casos de prueba y prueba manual de los criterios de {hid} en {donde}",
                         "hecho_cuando": "Cada criterio de aceptación tiene un caso ejecutado con datos ficticios; defectos reportados en Jira",
                         "estado": "Hecho" if hecho_qa else "Por hacer", "cubre": "criterios de la historia",
                         "depende": "las demás subtareas", "nivel": "R", "sprint": sprint})
            comps.add("QA")
        if not subs:
            errores.append(f"{hid} sin subtareas")
        hechas = sum(s["estado"] == "Hecho" for s in subs)
        estado = "Hecho" if hechas == len(subs) else ("En curso" if hechas else "Por hacer")
        historias.append({"clave": hid, "epica": epica, "como": como, "quiero": quiero, "para": para, "puntos": pts,
                          "prioridad": prio, "sprint": sprint, "pantallas": pantallas, "criterios": criterios,
                          "componentes": sorted(comps, key=list(B.COMPONENTES).index), "frs": sorted(frs),
                          "estado": estado, "pivote": hid == B.PIVOTE["id"]})
        subtareas += subs

    # Dependencias entre sprints (con el sprint de la historia, no el del tasks.md)
    for tid, (codigo, t) in tareas_idx.items():
        if tid not in sprint_de_tarea or t["hecha"]:
            continue
        for d in t["depende"]:
            dd = d if re.match(r"\d{3}-T", d) else f"{codigo}-{d}"
            if dd in sprint_de_tarea and not tareas_idx[dd][1]["hecha"] and list(B.SPRINTS).index(sprint_de_tarea[dd]) > list(B.SPRINTS).index(sprint_de_tarea[tid]):
                errores.append(f"{tid} ({sprint_de_tarea[tid]}) depende de {dd} ({sprint_de_tarea[dd]})")

    # Orden de trabajo y claves de Jira
    jira = {}
    ruta_jira = SALIDA / "jira-claves.json"
    if ruta_jira.exists():
        jira = json.loads(ruta_jira.read_text(encoding="utf-8"))["historias"]
    pos = {hid: (list(B.SPRINTS).index(sp), i) for sp, lst in B.ORDEN.items() for i, hid in enumerate(lst)}
    for h in historias:
        if h["clave"] not in pos:
            errores.append(f"{h['clave']} no está en ORDEN")
        h["jira"] = jira.get(h["clave"], "")
    for sp, lst in B.ORDEN.items():
        for hid in lst:
            h = next((x for x in historias if x["clave"] == hid), None)
            if h and h["sprint"] != sp:
                errores.append(f"{hid} está en ORDEN[{sp}] pero su sprint es {h['sprint']}")
    historias.sort(key=lambda h: pos.get(h["clave"], (99, 0)))
    for n, h in enumerate(historias, 1):
        h["orden"] = n

    piv = next(h for h in historias if h["pivote"])
    if piv["puntos"] != B.PIVOTE["puntos"]:
        errores.append("La pivote no vale lo que dice PIVOTE")

    # Carga por sprint y por épica
    carga = defaultdict(int)
    matriz = defaultdict(lambda: defaultdict(int))
    for h in historias:
        carga[h["sprint"]] += h["puntos"]
        matriz[h["epica"]][h["sprint"]] += h["puntos"]
    for s, cap in B.CAPACIDAD.items():
        if cap and carga[s] > cap:
            avisos.append(f"{s} tiene {carga[s]} puntos y la capacidad planeada es {cap}")
    comp_sprint = defaultdict(lambda: defaultdict(int))
    for s in subtareas:
        comp_sprint[s["componente"]][s["sprint"]] += 1

    epicas = []
    for c, s in specs.items():
        hs = [h for h in historias if h["epica"] == c]
        if not hs:
            continue
        epicas.append({"clave": c, "titulo": s["titulo"], "carpeta": s["carpeta"], "puntos": sum(h["puntos"] for h in hs),
                       "historias": len(hs), "prioridad": min((h["prioridad"] for h in hs), key=ORDEN_P.index)})

    datos = {
        "sprints": B.SPRINTS, "capacidad": B.CAPACIDAD, "componentes": B.COMPONENTES, "prioridades": B.PRIORIDADES,
        "pivote": B.PIVOTE, "escala": B.ESCALA, "epicas": epicas, "historias": historias, "subtareas": subtareas,
        "futuro": B.FUTURO, "carga": dict(carga), "matriz": {k: dict(v) for k, v in matriz.items()},
        "comp_sprint": {k: dict(v) for k, v in comp_sprint.items()},
    }

    print("Puntos por sprint:", {s: carga.get(s, 0) for s in B.SPRINTS})
    print(f"{len(epicas)} épicas, {len(historias)} historias, {len(subtareas)} subtareas, "
          f"{sum(h['puntos'] for h in historias)} puntos (+{len(B.FUTURO)} épicas fuera del curso)")

    if "--sincronizar" in sys.argv and not errores:
        sincronizar(specs, sprint_de_tarea)

    if "--verificar" not in sys.argv:
        SALIDA.mkdir(parents=True, exist_ok=True)
        (SALIDA / "backlog.json").write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
        with open(SALIDA / "backlog.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["orden", "sprint", "jira", "tipo", "clave", "historia", "epica", "spec", "titulo", "componente",
                        "puntos", "prioridad", "estado", "depende_de", "hecho_cuando", "pantallas", "requisitos", "rama_sugerida"])
            carpeta = {e["clave"]: e["carpeta"] for e in epicas}
            for h in historias:
                rama = f"{h['jira']}-{h['clave'].lower()}" if h["jira"] else h["clave"].lower()
                w.writerow([h["orden"], h["sprint"], h["jira"], "Historia", h["clave"], "", h["epica"], f"specs/{carpeta[h['epica']]}",
                            f"Como {h['como']}, quiero {h['quiero']}, para {h['para']}", " ".join(h["componentes"]), h["puntos"],
                            B.PRIORIDADES[h["prioridad"]][0], h["estado"], "", " | ".join(h["criterios"]), h["pantallas"],
                            " ".join(h["frs"]), rama])
                for s in (x for x in subtareas if x["historia"] == h["clave"]):
                    w.writerow([h["orden"], s["sprint"], "", "Subtarea", s["clave"], h["clave"], s["epica"], f"specs/{carpeta[h['epica']]}",
                                s["resumen"], s["componente"], "", B.PRIORIDADES[h["prioridad"]][0], s["estado"], s["depende"],
                                s["hecho_cuando"], "", s["cubre"], ""])
        escribir_jira(datos, specs)

    for a in avisos:
        print("AVISO:", a)
    for e in errores:
        print("ERROR:", e)
    sys.exit(1 if errores else 0)


SLUG = {"BE": "comp-backend", "WEB": "comp-web", "AND": "comp-android", "IOS": "comp-ios", "QA": "comp-qa", "DIS": "comp-diseno", "DOC": "comp-docs"}


TIPO_ES = {"Epic": "Épica", "Story": "Historia", "Subtask": "Subtarea"}
PRIO_ES = {"Highest": "Más alta", "High": "Alta", "Medium": "Media", "Low": "Baja", "Lowest": "Más baja"}
ESTADO_ES = {"To Do": "Por hacer", "In Progress": "En curso", "Done": "Listo"}


def escribir_jira(D, specs):
    """CSV para Jira Cloud (Sistema externo > CSV). Issue Id y Parent Id enlazan épica, historia y subtarea."""
    estado_jira = {"Hecho": "Done", "En curso": "In Progress", "Por hacer": "To Do"}
    sprint_jira = {k: ("" if k == "BL" else f"SGHU {v[0]}") for k, v in B.SPRINTS.items()}
    with open(SALIDA / "jira-import.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Issue Id", "Parent Id", "Issue Type", "Summary", "Description", "Story Points", "Priority",
                    "Sprint", "Labels", "Labels", "Labels", "Labels", "Labels", "Status"])
        ids, n = {}, 1

        def fila(pid, tipo, resumen, desc, pts, prio, sprint, labels, comps, estado):
            nonlocal n
            labels = (labels + ["", ""])[:2]
            comps = ([SLUG[c] for c in comps] + ["", "", ""])[:3]
            w.writerow([n, pid, tipo, resumen, desc, pts, prio, sprint, *labels, *comps, estado])
            n += 1
            return n - 1

        for e in D["epicas"]:
            ids[e["clave"]] = fila("", "Epic", f"{e['clave']} {e['titulo']}",
                                   f"Spec: specs/{e['carpeta']}/spec.md (requisitos EARS y escenarios de aceptación).",
                                   "", e["prioridad"], "", [f"spec-{e['clave']}"], [], "To Do")
        for code, titulo, pant, flujo, texto, _ in D["futuro"]:
            fila("", "Epic", f"{code} {titulo} (fuera del curso)",
                 f"{texto}\nPantallas diseñadas: {pant}. Flujo: {flujo}. Nivel F: no entra en sprints del curso.",
                 "", "Lowest", "", ["produccion-climesa"], [], "To Do")
        for h in D["historias"]:
            desc = (f"Como {h['como']}, quiero {h['quiero']}, para {h['para']}.\n\n"
                    f"Criterios de aceptación:\n" + "\n".join(f"- {c}" for c in h["criterios"]) +
                    (f"\n\nPantallas: {h['pantallas']}" if h["pantallas"] else "") +
                    (f"\nRequisitos: {', '.join(h['frs'])}" if h["frs"] else "") +
                    ("\n\nHISTORIA PIVOTE: referencia de 3 puntos para estimar las demás." if h["pivote"] else ""))
            comps = [c for c in h["componentes"] if c in CLIENTES or c == "BE"][:3]
            labels = [f"spec-{h['epica']}"] + (["pivote"] if h["pivote"] else [])
            ids[h["clave"]] = fila(ids[h["epica"]], "Story", f"{h['clave']} {h['quiero'][0].upper()}{h['quiero'][1:]}",
                                   desc, h["puntos"], h["prioridad"], sprint_jira[h["sprint"]], labels, comps,
                                   estado_jira[h["estado"]])
        for s in D["subtareas"]:
            desc = f"Hecho cuando: {s['hecho_cuando']}\nDepende de: {s['depende']}" + (f"\nCubre: {s['cubre']}" if s["cubre"] else "")
            h = next(x for x in D["historias"] if x["clave"] == s["historia"])
            fila(ids[s["historia"]], "Subtask", f"{s['clave']} {s['resumen']}", desc, "", h["prioridad"],
                 "", [f"spec-{s['epica']}", f"nivel-{s['nivel']}"], [s["componente"]],
                 "Done" if s["estado"] == "Hecho" else "To Do")


if __name__ == "__main__":
    main()
