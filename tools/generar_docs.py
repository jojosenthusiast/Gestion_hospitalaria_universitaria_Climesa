#!/usr/bin/env python3
"""Genera documentos derivados desde los catálogos en docs/arquitectura/datos.

Fuentes (se editan a mano):  roles.csv, permisos.csv, endpoints.csv, pantallas.csv
Salidas (no se editan a mano): docs/arquitectura/roles-y-permisos.md, docs/diseno/inventario-pantallas.md

Uso:  python3 tools/generar_docs.py            (escribe)
      python3 tools/generar_docs.py --verificar (falla si las salidas no están al día o hay inconsistencias)
"""
import csv
import re
import sys
from collections import OrderedDict, defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "docs" / "arquitectura" / "datos"
SALIDA_RBAC = RAIZ / "docs" / "arquitectura" / "roles-y-permisos.md"
SALIDA_PANTALLAS = RAIZ / "docs" / "diseno" / "inventario-pantallas.md"
SALIDA_SQL = RAIZ / "supabase" / "migrations" / "20261017000210_acceso_semilla.sql"
SALIDA_CONTEXTOS = RAIZ / "supabase" / "migrations" / "20261029000100_acceso_contextos_ficha.sql"
SALIDA_ATRIBUTOS = RAIZ / "supabase" / "migrations" / "20261030000100_permisos_atributos.sql"

# Permisos que se agregaron al catálogo después de aplicada la semilla (regla 10 de AGENTS.md: la semilla no se edita). La semilla
# no los emite; la migración de SALIDA_ATRIBUTOS los inserta. Son permisos de atributo: deciden qué campos o filas ve quien ya
# entró por un endpoint, así que ningún endpoint los declara y no cuentan como "sin endpoint" (el código los consulta con hasPermission).
PERMISOS_POSTERIORES = [
    "pacientes.ver_nacimiento",
    "pacientes.ver_contacto",
    "personal.ver_datos_personales",
    "turnos.ver_borradores",
]

# Contextos que permisos.csv cambió después de aplicada la semilla (regla 10 de AGENTS.md: las migraciones aplicadas no se editan).
# (rol, permiso, contexto en la semilla, contexto actual en permisos.csv). La semilla conserva el histórico y la migración
# de SALIDA_CONTEXTOS lo actualiza; añadir aquí un cambio nuevo regenera ambas y verificar_consistencia exige que el CSV coincida.
AJUSTES_CONTEXTO = [
    ("AST", "pacientes.ver_ficha", "x", "area"),
    ("ENF", "pacientes.ver_ficha", "x", "area"),
    ("LAB", "pacientes.ver_ficha", "x", "orden"),
]

FLUJOS = [
    ("F01 Cuenta del paciente", "A01 Ingreso → A02 Crear cuenta → A03 Vincular expediente → (recepción A33 o W27 aprueba) → A04 Inicio del paciente"),
    ("F02 Fila del día", "Recepción A31 o W29 emite → Paciente A05 sigue su número → Asistente A40 llama → Médico A20 Mi día → A21 Consulta → Paciente A08 Historial; pantalla pública W34 muestra el llamado"),
    ("F03 Cita pedida por el paciente", "Paciente A06 pide → Recepción W28 o A32 confirma → Paciente A06 ve confirmada → día de la cita: Médico A20 → A21"),
    ("F04 Consulta y laboratorio", "Médico A21 ordena → Laboratorio W20 o A60 cola → A61 muestra → A62 o W21 captura y completa → Médico A23 revisa (crítico avisa antes) → Paciente A07 ve valores"),
    ("F05 Admisión y alta", "Médico A24 indica hospitalización → Recepción W13 → W14 sugerencias y cama → Enfermería A50 y A51 → Médico A24 firma alta → salida → Enfermería A52 limpieza y verificación → Jefe W12 cama libre"),
    ("F06 Traslado", "Recepción W13 → W15 traslado (no existe para VIP) → W12 tablero actualizado"),
    ("F07 Ambulancia", "Paciente A09 pide (o recepción por teléfono en W18) → Despacho W18 confirma y despacha → Paramédico A70 acepta → A71 hitos → A72 reporte prehospital → Emergencia A54 y Médico A25 reciben → Recepción W14 admisión con origen ambulancia → W19 bitácora"),
    ("F08 Turnos", "Jefe W16 planificador → W17 turno (traslape rechazado) → publicar con advertencias → Personal A26 o I26 → Pantalla pública W34 médicos de turno"),
    ("F09 Acceso excepcional", "Jefe o Admin W31 pide (o Médico desde estado sin permiso en A22) → Delegado W30 aprueba → acceso temporal → Delegado W32 auditoría → Paciente A11 ve el acceso"),
    ("F10 Inventario", "Enfermería A53 consumo → alerta en Jefe W03 y W22 → W23 entrada de reposición"),
    ("F11 Administración", "Admin W05 usuarios → W06 invitar con roles → persona W02 activa su cuenta → Admin W07 y W08 personal e inscripciones → W09 edificio → W10 catálogo de laboratorio"),
    ("F12 Información pública", "Jefe W25 publica aviso → W34 pantalla pública y A10 o I10 en las apps"),
]

CONTEXTO = {
    "x": "✔",
    "propio": "propio",
    "relacion": "relación",
    "area": "área",
    "autor": "autor",
    "propio_revisado": "propio revisado",
    "consumo": "consumo",
    "reactivos": "reactivos",
    "orden": "orden",
    "rango": "rango de edad",
}


def leer(nombre):
    with open(DATOS / nombre, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def celda(valor):
    return CONTEXTO.get(valor, valor) if valor else "·"


def esc(texto):
    return texto.replace("|", "\\|")


def generar_rbac(roles, permisos, endpoints):
    codigos = [r["codigo"] for r in roles]
    por_permiso = {p["permiso"]: p for p in permisos}
    lineas = [
        "# Roles y matriz de control de acceso (RBAC)",
        "",
        "> Archivo generado por `tools/generar_docs.py` desde `docs/arquitectura/datos/`. No editar a mano.",
        "",
        "Requisitos: REQ-PRV-04 (matriz por rol de endpoints y vistas), REQ-ROL-01 a 06. Decisiones: D-031, D-050 a D-053.",
        "",
        "## Roles",
        "",
        "| Código | Rol | Plataformas | Origen | Qué hace |",
        "|---|---|---|---|---|",
    ]
    for r in roles:
        lineas.append(f"| {r['codigo']} | {r['nombre']} | {r['plataformas']} | {r['origen']} | {esc(r['descripcion'])} |")
    lineas += [
        "",
        "## Cómo leer las matrices",
        "",
        "| Marca | Significado |",
        "|---|---|",
        "| ✔ | Permitido sin condición adicional |",
        "| relación | Solo con relación de atención activa con el paciente (consulta, admisión, servicio de ambulancia) o acceso excepcional aprobado (D-031) |",
        "| propio | Solo sobre sí mismo (el paciente sobre su expediente, el médico sobre sus citas, el paramédico sobre sus servicios) |",
        "| propio revisado | El paciente ve sus resultados y su historial solo después de la revisión médica (D-040) |",
        "| área | Solo pacientes del área o planta donde la persona tiene turno en curso |",
        "| autor | Solo quien creó el registro |",
        "| · | Denegado (y auditado si se intenta) |",
        "",
        "El permiso `camas.ver_ocupante` no tiene endpoint propio: decide si el tablero de camas muestra el nombre del ocupante o solo sus iniciales.",
        "",
        "## Matriz de permisos por rol",
        "",
        "| Permiso | Descripción | " + " | ".join(codigos) + " |",
        "|---|---|" + "---|" * len(codigos),
    ]
    for p in permisos:
        valores = " | ".join(celda(p[c]) for c in codigos)
        lineas.append(f"| `{p['permiso']}` | {esc(p['descripcion'])} | {valores} |")
    lineas += [
        "",
        "## Matriz de endpoints por rol",
        "",
        "Nivel: R = exigido por el curso; E = extra de alto valor; F = solo CLIMESA. Semana = semana del cronograma en que debe funcionar.",
        "",
    ]
    por_spec = OrderedDict()
    for e in endpoints:
        por_spec.setdefault(e["spec"], []).append(e)
    for spec, lista in por_spec.items():
        lineas += [
            f"### Spec {spec}",
            "",
            "| Método | Ruta | Permiso | Condición | Nivel | Sem. | " + " | ".join(codigos) + " |",
            "|---|---|---|---|---|---|" + "---|" * len(codigos),
        ]
        for e in lista:
            if e["permiso"] == "(público)":
                valores = " | ".join("✔" for _ in codigos)
                permiso = "público, sin sesión"
            else:
                p = por_permiso[e["permiso"]]
                valores = " | ".join(celda(p[c]) for c in codigos)
                permiso = f"`{e['permiso']}`"
            lineas.append(
                f"| {e['metodo']} | `{e['ruta']}` | {permiso} | {esc(e['contexto'])} | {e['nivel']} | {e['semana']} | {valores} |"
            )
        lineas.append("")
    return "\n".join(lineas) + "\n"


def generar_pantallas(pantallas, roles):
    lineas = [
        "# Inventario de pantallas",
        "",
        "> Archivo generado por `tools/generar_docs.py` desde `docs/arquitectura/datos/pantallas.csv`. No editar a mano.",
        "",
        "Para el equipo de Figma. El avance del 31 de octubre exige el diseño del 100% de las pantallas de iOS, Android y web, con flujos y sistema de diseño (paleta accesible, tipografía, estados de componentes).",
        "",
        "Cada pantalla trae: para quién es, qué muestra, qué se puede hacer, qué cambia sola en tiempo real y qué datos deben ocultarse. Las pantallas del paciente y del médico existen en Android e iOS con el mismo contenido (prefijos A e I con el mismo número); se diseñan una vez como componentes y se adaptan a cada plataforma (Material 3 en Android, guías de Apple en iOS).",
        "",
        "## Resumen",
        "",
        "| Plataforma | Pantallas | Exigidas (R) | Extra (E) |",
        "|---|---|---|---|",
    ]
    conteo = defaultdict(lambda: [0, 0, 0])
    for p in pantallas:
        c = conteo[p["plataforma"]]
        c[0] += 1
        c[1 if p["nivel"] == "R" else 2] += 1
    for plat, (t, r, e) in conteo.items():
        lineas.append(f"| {plat} | {t} | {r} | {e} |")
    lineas += [
        "",
        "## Estados que toda pantalla debe diseñar",
        "",
        "1. **Cargando**: esqueleto del contenido, no un spinner solo.",
        "2. **Vacío**: texto que explica por qué no hay nada y qué hacer.",
        "3. **Error**: qué pasó en lenguaje simple y botón Reintentar.",
        "4. **Sin permiso**: \"No tienes acceso a esta información\" sin revelar si el dato existe.",
        "5. **Sin conexión**: banda superior \"Sin conexión, mostrando lo último guardado\"; en la app del paramédico, indicador de envíos en cola.",
        "6. **Actualizado en vivo**: cuando un dato cambia por tiempo real, se resalta brevemente; nunca se mueve la lista bajo el dedo del usuario.",
        "7. **Conflicto**: \"Otra persona tomó esta cama, te sugerimos la siguiente\" (asignación, despacho, turnos).",
        "",
        "## Componentes del sistema de diseño",
        "",
        "Estado de cama (libre, ocupada, reservada, limpieza, bloqueada), estado de ambulancia (Disponible, En Servicio, En Mantenimiento), estado de laboratorio (Pendiente, En Proceso, Completado, Cancelado, Revisado), número de fila grande, tarjeta de indicador, fila de tabla con acciones, buscador con motivo de coincidencia, valor de laboratorio con rango y marca alto, bajo o crítico, línea de tiempo de hitos, banda de conexión, insignia de rol, aviso 911. Cada estado se distingue por texto y forma, no solo por color.",
        "",
    ]
    lineas += [
        "## Flujos entre pantallas",
        "",
        "El curso pide el mapeo de flujos de todas las pantallas. Estos son los recorridos completos; en Figma cada uno es un prototipo enlazado. Las pantallas A del paciente y del médico tienen su par I en iOS.",
        "",
        "| Flujo | Recorrido |",
        "|---|---|",
    ]
    for nombre, ruta in FLUJOS:
        lineas.append(f"| {nombre} | {ruta} |")
    lineas.append("")
    for plat in ["Web", "Android", "iOS"]:
        lineas += [f"## {plat}", ""]
        for p in [x for x in pantallas if x["plataforma"] == plat]:
            lineas += [
                f"### {p['id']} · {p['nombre']} ({p['nivel']})",
                "",
                f"- **Para:** {p['roles']}",
                f"- **Propósito:** {p['proposito']}",
                f"- **Muestra:** {p['muestra']}",
                f"- **Acciones:** {p['acciones']}",
            ]
            if p["tiempo_real"]:
                lineas.append(f"- **En vivo:** {p['tiempo_real']}")
            if p["privacidad"]:
                lineas.append(f"- **Privacidad:** {p['privacidad']}")
            lineas += [f"- **Spec:** {p['spec']}", ""]
    lineas += ["## Pantallas por rol", "", "| Rol | Web | Android | iOS |", "|---|---|---|---|"]
    for r in roles:
        fila = []
        for plat in ["Web", "Android", "iOS"]:
            if plat not in r["plataformas"]:
                fila.append("no usa")
                continue
            ids = [
                p["id"]
                for p in pantallas
                if p["plataforma"] == plat
                and (
                    r["codigo"] in p["roles"]
                    or "Todos" in p["roles"]
                    or "todos" in p["roles"]
                    and (r["codigo"] != "PAC" or "PAC" in p["roles"])
                )
                and not ("todos los de personal" in p["roles"] and r["codigo"] == "PAC")
            ]
            fila.append(", ".join(ids) if ids else "·")
        lineas.append(f"| {r['nombre']} | " + " | ".join(fila) + " |")
    return "\n".join(lineas) + "\n"


def sql_txt(v):
    return "'" + v.replace("'", "''") + "'"


def generar_sql(roles, permisos):
    codigos = [r["codigo"] for r in roles]
    l = [
        "-- Generado por tools/generar_docs.py desde docs/arquitectura/datos/roles.csv y permisos.csv. No editar a mano.",
        "-- Catálogo de roles y permisos (FR-101-12).",
        "",
        "insert into acceso.rol (codigo, nombre, plataformas, descripcion) values",
    ]
    filas = []
    for r in roles:
        plats = "array[" + ", ".join(sql_txt(x.strip()) for x in r["plataformas"].split(";")) + "]"
        filas.append(f"  ({sql_txt(r['codigo'])}, {sql_txt(r['nombre'])}, {plats}, {sql_txt(r['descripcion'])})")
    l.append(",\n".join(filas) + ";")
    permisos = [p for p in permisos if p["permiso"] not in PERMISOS_POSTERIORES]
    l += ["", "insert into acceso.permiso (codigo, descripcion) values"]
    l.append(",\n".join(f"  ({sql_txt(p['permiso'])}, {sql_txt(p['descripcion'])})" for p in permisos) + ";")
    l += ["", "insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values"]
    historico = {(r, p): desde for r, p, desde, _ in AJUSTES_CONTEXTO}
    filas = []
    for p in permisos:
        for c in codigos:
            if p[c]:
                filas.append(f"  ({sql_txt(c)}, {sql_txt(p['permiso'])}, {sql_txt(historico.get((c, p['permiso']), p[c]))})")
    l.append(",\n".join(filas) + ";")
    return "\n".join(l) + "\n"


def generar_sql_contextos():
    l = [
        "-- Generado por tools/generar_docs.py desde AJUSTES_CONTEXTO y permisos.csv. No editar a mano.",
        "-- Contextos de rol_permiso que cambiaron después de la semilla de acceso (regla 10: no se edita la semilla).",
        "-- Idempotente: solo actualiza filas que aún tienen el contexto anterior. acceso.rol_permiso.contexto no tiene check.",
        "",
    ]
    for r, p, desde, hasta in AJUSTES_CONTEXTO:
        l.append(
            f"update acceso.rol_permiso set contexto = {sql_txt(hasta)} "
            f"where rol_codigo = {sql_txt(r)} and permiso_codigo = {sql_txt(p)} and contexto = {sql_txt(desde)};"
        )
    return "\n".join(l) + "\n"


def generar_sql_atributos(roles, permisos):
    codigos = [r["codigo"] for r in roles]
    nuevos = [p for p in permisos if p["permiso"] in PERMISOS_POSTERIORES]
    l = [
        "-- Generado por tools/generar_docs.py desde PERMISOS_POSTERIORES y permisos.csv. No editar a mano.",
        "-- Permisos de atributo: reemplazan decisiones por código de rol en la API (regla 8 de AGENTS.md). Conservan el comportamiento vigente.",
        "-- Idempotente: no duplica permisos ni asignaciones que ya existan.",
        "",
        "insert into acceso.permiso (codigo, descripcion) values",
        ",\n".join(f"  ({sql_txt(p['permiso'])}, {sql_txt(p['descripcion'])})" for p in nuevos),
        "on conflict (codigo) do nothing;",
        "",
        "insert into acceso.rol_permiso (rol_codigo, permiso_codigo, contexto) values",
    ]
    filas = [f"  ({sql_txt(c)}, {sql_txt(p['permiso'])}, {sql_txt(p[c])})" for p in nuevos for c in codigos if p[c]]
    l.append(",\n".join(filas))
    l.append("on conflict (rol_codigo, permiso_codigo) do nothing;")
    return "\n".join(l) + "\n"


def verificar_consistencia(permisos, endpoints, pantallas, roles):
    errores = []
    nombres = {p["permiso"] for p in permisos}
    for e in endpoints:
        if e["permiso"] != "(público)" and e["permiso"] not in nombres:
            errores.append(f"Endpoint {e['metodo']} {e['ruta']} usa permiso inexistente {e['permiso']}")
        if e["nivel"] not in ("R", "E", "F"):
            errores.append(f"Endpoint {e['ruta']} con nivel inválido {e['nivel']}")
    por_permiso = {p["permiso"]: p for p in permisos}
    for r, perm, _, hasta in AJUSTES_CONTEXTO:
        actual = por_permiso.get(perm, {}).get(r)
        if actual != hasta:
            errores.append(f"AJUSTES_CONTEXTO dice {r} {perm} = {hasta} y permisos.csv dice {actual!r}")
    for codigo in PERMISOS_POSTERIORES:
        if codigo not in nombres:
            errores.append(f"PERMISOS_POSTERIORES menciona {codigo}, que no está en permisos.csv")
    usados = {e["permiso"] for e in endpoints}
    for p in permisos:
        if p["permiso"] not in usados and p["permiso"] != "camas.ver_ocupante" and p["permiso"] not in PERMISOS_POSTERIORES:
            errores.append(f"Permiso {p['permiso']} sin endpoint")
    ids = [p["id"] for p in pantallas]
    if len(ids) != len(set(ids)):
        errores.append("IDs de pantalla repetidos")
    return errores


PRIVACIDAD = RAIZ / "docs" / "arquitectura" / "privacidad.md"
# Columna de la tabla de campos (privacidad.md §2) -> código de rol de roles.csv. "Público" no es un rol.
COLUMNAS_CAMPOS = {
    "Paciente": "PAC", "Recepción": "REC", "Asistente": "AST", "Enfermería": "ENF", "Médico tratante": "MED",
    "Laboratorio": "LAB", "Paramédico": "PAR", "Jefe Op.": "JOP", "Admin": "ADM", "Público": None,
}
# Permisos de lectura o escritura clínica: ni Administrador, Jefe de Operaciones ni Recepción los tienen por rol (D-031).
PERMISOS_CLINICOS = [
    "expediente.ver", "consulta.iniciar", "consulta.registrar", "consulta.corregir", "signos.registrar", "recetas.emitir",
    "laboratorio.ordenar", "laboratorio.procesar", "laboratorio.validar", "laboratorio.revisar", "resultados.ver",
    "alta.firmar", "enfermeria.registrar", "ambulancia.recibir_prehospital",
]
# Desvíos conocidos entre permisos.csv y privacidad.md §2, pendientes de decisión de producto (ver docs/preguntas-abiertas.md).
# Si uno deja de ser cierto, verificar exige quitarlo de aquí.
DIVERGENCIAS_CONOCIDAS = {
    ("ambulancia.recibir_prehospital", "JOP"),
    ("ambulancia.recibir_prehospital", "REC"),
}
CELDA_CAMPO = re.compile(r"^(✔|·|Solo agregado|Número sin nombre)( \(.+\))?$")


def leer_tabla_campos():
    """Devuelve (columnas, filas) de la tabla '## 2. Campos del expediente del paciente' de privacidad.md."""
    lineas = PRIVACIDAD.read_text(encoding="utf-8").splitlines()
    inicio = next((i for i, l in enumerate(lineas) if l.startswith("## 2.")), None)
    if inicio is None:
        return [], [], ["privacidad.md: falta la sección '## 2.' con la tabla de campos"]
    tabla = []
    for l in lineas[inicio + 1:]:
        if l.startswith("## "):
            break
        if l.startswith("|"):
            tabla.append([c.strip() for c in l.strip().strip("|").split("|")])
    if len(tabla) < 3:
        return [], [], ["privacidad.md §2: no se encontró la tabla de campos"]
    return tabla[0], [f for f in tabla[2:]], []


def verificar_politica_campos(permisos, roles):
    """Verifica la política de campos (privacidad.md §2) contra los catálogos: estructura, celdas válidas y D-031."""
    errores = []
    cabecera, filas, previos = leer_tabla_campos()
    if previos:
        return previos
    esperado = ["Campo", "Clase"] + list(COLUMNAS_CAMPOS)
    if cabecera != esperado:
        errores.append(f"privacidad.md §2: columnas {cabecera}, se esperaban {esperado}")
        return errores
    codigos = {r["codigo"] for r in roles}
    for rol in (c for c in COLUMNAS_CAMPOS.values() if c):
        if rol not in codigos:
            errores.append(f"privacidad.md §2 usa el rol {rol}, que no está en roles.csv")
    nombres = [f[0] for f in filas]
    if len(nombres) != len(set(nombres)):
        errores.append("privacidad.md §2: hay campos repetidos")
    for fila in filas:
        if len(fila) != len(esperado):
            errores.append(f"privacidad.md §2: la fila '{fila[0]}' tiene {len(fila)} celdas, se esperaban {len(esperado)}")
            continue
        if fila[1] not in ("Personal", "Clínica (sensible)", "Clínica"):
            errores.append(f"privacidad.md §2: '{fila[0]}' con clase inválida '{fila[1]}'")
        for columna, celda_ in zip(esperado[2:], fila[2:]):
            if not CELDA_CAMPO.match(celda_):
                errores.append(f"privacidad.md §2: celda inválida '{celda_}' en '{fila[0]}' / {columna}")
        if fila[1].startswith("Clínica"):
            for columna in ("Recepción", "Jefe Op.", "Admin", "Público"):
                if fila[2 + list(COLUMNAS_CAMPOS).index(columna)] != "·":
                    errores.append(f"privacidad.md §2: '{fila[0]}' es clínico y no debe verlo {columna} por su rol (D-031)")
    por_nombre = {p["permiso"]: p for p in permisos}
    vistas = set()
    for permiso in PERMISOS_CLINICOS:
        if permiso not in por_nombre:
            errores.append(f"PERMISOS_CLINICOS menciona {permiso}, que no está en permisos.csv")
            continue
        for rol in ("ADM", "JOP", "REC"):
            if por_nombre[permiso][rol]:
                if (permiso, rol) in DIVERGENCIAS_CONOCIDAS:
                    vistas.add((permiso, rol))
                else:
                    errores.append(f"permisos.csv da {permiso} a {rol}, pero el contenido clínico no es de ese rol (D-031, privacidad.md §2)")
    for sobrante in sorted(DIVERGENCIAS_CONOCIDAS - vistas):
        errores.append(f"DIVERGENCIAS_CONOCIDAS ya no aplica: {sobrante}; quítala de tools/generar_docs.py")
    return errores


def main():
    roles, permisos = leer("roles.csv"), leer("permisos.csv")
    endpoints, pantallas = leer("endpoints.csv"), leer("pantallas.csv")
    errores = verificar_consistencia(permisos, endpoints, pantallas, roles) + verificar_politica_campos(permisos, roles)
    salidas = {
        SALIDA_RBAC: generar_rbac(roles, permisos, endpoints),
        SALIDA_PANTALLAS: generar_pantallas(pantallas, roles),
        SALIDA_SQL: generar_sql(roles, permisos),
        SALIDA_CONTEXTOS: generar_sql_contextos(),
        SALIDA_ATRIBUTOS: generar_sql_atributos(roles, permisos),
    }
    if "--verificar" in sys.argv:
        for ruta, contenido in salidas.items():
            if not ruta.exists() or ruta.read_text(encoding="utf-8") != contenido:
                errores.append(f"{ruta.relative_to(RAIZ)} no está al día: ejecutar tools/generar_docs.py")
    else:
        for ruta, contenido in salidas.items():
            ruta.parent.mkdir(parents=True, exist_ok=True)
            ruta.write_text(contenido, encoding="utf-8")
            print(f"escrito {ruta.relative_to(RAIZ)}")
    for e in errores:
        print("ERROR:", e)
    print(f"{len(roles)} roles, {len(permisos)} permisos, {len(endpoints)} endpoints, {len(pantallas)} pantallas")
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()
