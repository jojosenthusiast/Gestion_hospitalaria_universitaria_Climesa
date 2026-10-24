#!/usr/bin/env python3
"""Genera docs/diseno/inventario-pantallas.html (página para el equipo de Figma) desde pantallas.csv y roles.csv."""
import csv, json, sys
from pathlib import Path
RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "tools"))
from generar_docs import FLUJOS  # noqa: E402
D = RAIZ / "docs" / "arquitectura" / "datos"
pant = list(csv.DictReader(open(D / "pantallas.csv", encoding="utf-8")))
roles = list(csv.DictReader(open(D / "roles.csv", encoding="utf-8")))
data = json.dumps({"pantallas": pant, "roles": roles, "flujos": FLUJOS}, ensure_ascii=False)
html = (RAIZ / "tools" / "pagina_pantallas.template.html").read_text(encoding="utf-8").replace("/*__DATA__*/null", data)
out = RAIZ / "docs" / "diseno" / "inventario-pantallas.html"
out.write_text(html, encoding="utf-8")
print("escrito", out.relative_to(RAIZ), len(html), "bytes")
