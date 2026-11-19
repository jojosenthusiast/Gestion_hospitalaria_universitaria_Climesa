#!/usr/bin/env python3
"""Generate the Android icon set from the web icon paths (web is the source of truth).

Reads the `paths` map in `web/src/components/ui.tsx` and the `GLYPHS` map in
`web/src/components/identity.tsx`, turns every <path>, <rect> and <circle> into SVG path
data, and writes `ClimesaIcons.kt`: one 24x24 `ImageVector` per name, stroked 1.7 with
round caps and joins and no fill, so `Icon(tint = ...)` colours it like `currentColor`.

Usage:
    python tools/icons/gen_android_icons.py           # write the Kotlin file
    python tools/icons/gen_android_icons.py --check   # exit 1 if the committed file is stale

Python standard library only.
"""
from __future__ import annotations

import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UI_TSX = ROOT / "web" / "src" / "components" / "ui.tsx"
IDENTITY_TSX = ROOT / "web" / "src" / "components" / "identity.tsx"
OUT = ROOT / "android" / "app" / "src" / "main" / "java" / "sv" / "edu" / "catolica" / "climesa" / "ui" / "icons" / "ClimesaIcons.kt"

ELEMENT = re.compile(r"<(path|rect|circle)\b([^>]*?)/>")
ATTR = re.compile(r'([a-zA-Z-]+)="([^"]*)"')
ENTRY = re.compile(r"^\s*([A-Za-z]+):\s*(.*?),?\s*$")


def fmt(value: float) -> str:
    """Shortest decimal for a coordinate: 12, 4.5, -2.25."""
    rounded = round(value, 3)
    if rounded == 0:
        rounded = 0.0
    text = f"{rounded:.3f}".rstrip("0").rstrip(".")
    return text or "0"


def block(source: str, start_marker: str) -> list[tuple[str, str]]:
    """`name: <jsx>` lines of the object literal that starts at `start_marker`, in source order."""
    start = source.index(start_marker)
    body = source[source.index("{", start + len(start_marker) - 1) + 1:]
    end = body.index("\n};")
    entries = []
    for line in body[:end].splitlines():
        match = ENTRY.match(line)
        if match and "<" in match.group(2):
            entries.append((match.group(1), match.group(2)))
    return entries


def rotate(point: tuple[float, float], angle_deg: float, cx: float, cy: float) -> tuple[float, float]:
    angle = math.radians(angle_deg)
    x, y = point[0] - cx, point[1] - cy
    return (cx + x * math.cos(angle) - y * math.sin(angle), cy + x * math.sin(angle) + y * math.cos(angle))


def rect_path(attrs: dict[str, str]) -> str:
    x, y = float(attrs.get("x", 0)), float(attrs.get("y", 0))
    w, h = float(attrs["width"]), float(attrs["height"])
    r = min(float(attrs.get("rx", 0)), w / 2, h / 2)
    # Corners as absolute points so a rotate() transform can be applied to each one.
    points = [
        ("M", (x + r, y)), ("L", (x + w - r, y)), ("A", (x + w, y + r)),
        ("L", (x + w, y + h - r)), ("A", (x + w - r, y + h)),
        ("L", (x + r, y + h)), ("A", (x, y + h - r)),
        ("L", (x, y + r)), ("A", (x + r, y)),
    ]
    transform = attrs.get("transform", "").strip()
    if transform:
        match = re.fullmatch(r"rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)", transform)
        if not match:
            raise ValueError(f"unsupported transform: {transform}")
        angle = float(match.group(1))
        cx, cy = float(match.group(2) or 0), float(match.group(3) or 0)
        points = [(cmd, rotate(p, angle, cx, cy)) for cmd, p in points]
    parts = []
    for cmd, (px, py) in points:
        if cmd == "A":
            if r == 0:
                continue
            # Circular corners: the x-axis rotation of the arc does not matter, so rotation keeps them exact.
            parts.append(f"A{fmt(r)} {fmt(r)} 0 0 1 {fmt(px)} {fmt(py)}")
        else:
            parts.append(f"{cmd}{fmt(px)} {fmt(py)}")
    return "".join(parts) + "Z"


def circle_path(attrs: dict[str, str]) -> str:
    cx, cy, r = float(attrs["cx"]), float(attrs["cy"]), float(attrs["r"])
    return f"M{fmt(cx - r)} {fmt(cy)}a{fmt(r)} {fmt(r)} 0 1 0 {fmt(2 * r)} 0a{fmt(r)} {fmt(r)} 0 1 0 {fmt(-2 * r)} 0Z"


def element_paths(jsx: str) -> list[str]:
    paths = []
    for tag, raw in ELEMENT.findall(jsx):
        attrs = dict(ATTR.findall(raw))
        if tag == "path":
            paths.append(attrs["d"])
        elif tag == "rect":
            paths.append(rect_path(attrs))
        else:
            paths.append(circle_path(attrs))
    if not paths:
        raise ValueError(f"no drawable element in {jsx!r}")
    return paths


def pascal(name: str) -> str:
    return name[0].upper() + name[1:]


def collect() -> list[tuple[str, str, list[str]]]:
    """(map key, Kotlin property, path data) for every web icon, then every identity glyph not already equal."""
    icons: list[tuple[str, str, list[str]]] = []
    seen: dict[str, list[str]] = {}
    for name, jsx in block(UI_TSX.read_text(encoding="utf-8"), "const paths: Record<IconName, ReactNode> = {"):
        paths = element_paths(jsx)
        icons.append((name, pascal(name), paths))
        seen[name] = paths
    for name, jsx in block(IDENTITY_TSX.read_text(encoding="utf-8"), "const GLYPHS: Record<IdentityIcon, ReactNode> = {"):
        paths = element_paths(jsx)
        if name in seen:
            if seen[name] == paths:
                continue
            # Same name, different drawing (clipboard, calendar): the identity glyph keeps its own entry.
            icons.append((f"glyph:{name}", f"Glyph{pascal(name)}", paths))
        else:
            icons.append((name, pascal(name), paths))
    return icons


def kotlin(icons: list[tuple[str, str, list[str]]]) -> str:
    lines = [
        "// GENERATED by tools/icons/gen_android_icons.py from web/src/components/ui.tsx and identity.tsx.",
        "// Do not edit by hand: change the web paths and run the script again.",
        "package sv.edu.catolica.climesa.ui.icons",
        "",
        "import androidx.compose.ui.graphics.Color",
        "import androidx.compose.ui.graphics.SolidColor",
        "import androidx.compose.ui.graphics.StrokeCap",
        "import androidx.compose.ui.graphics.StrokeJoin",
        "import androidx.compose.ui.graphics.vector.ImageVector",
        "import androidx.compose.ui.graphics.vector.addPathNodes",
        "import androidx.compose.ui.unit.dp",
        "",
        "/**",
        " * The web icon set (24 grid, outline, stroke 1.7, round caps and joins). Tint with `Icon(tint = ...)`.",
        " * Identity glyphs whose web drawing differs from the icon of the same name are prefixed `Glyph`.",
        " */",
        "object ClimesaIcons {",
    ]
    for key, prop, paths in icons:
        args = ", ".join(f'"{p}"' for p in paths)
        lines.append(f'    val {prop}: ImageVector by lazy {{ climesaIcon("{key}", {args}) }}')
    lines.append("")
    lines.append("    /** Every icon by its web name (`glyph:` prefix for the identity variants), in web order. */")
    lines.append("    val all: Map<String, ImageVector> by lazy {")
    lines.append("        linkedMapOf(")
    for key, prop, _ in icons:
        lines.append(f'            "{key}" to {prop},')
    lines.append("        )")
    lines.append("    }")
    lines.append("")
    lines.append("    /** Raw path data by web name, for checks against the web source. */")
    lines.append("    val pathData: Map<String, List<String>> = linkedMapOf(")
    for key, _, paths in icons:
        args = ", ".join(f'"{p}"' for p in paths)
        lines.append(f'        "{key}" to listOf({args}),')
    lines.append("    )")
    lines.append("}")
    lines.append("")
    lines.append("private fun climesaIcon(name: String, vararg paths: String): ImageVector =")
    lines.append('    ImageVector.Builder(name = "Climesa.$name", defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)')
    lines.append("        .apply {")
    lines.append("            paths.forEach { d ->")
    lines.append("                addPath(")
    lines.append("                    pathData = addPathNodes(d),")
    lines.append("                    fill = null,")
    lines.append("                    stroke = SolidColor(Color.Black),")
    lines.append("                    strokeLineWidth = 1.7f,")
    lines.append("                    strokeLineCap = StrokeCap.Round,")
    lines.append("                    strokeLineJoin = StrokeJoin.Round,")
    lines.append("                )")
    lines.append("            }")
    lines.append("        }")
    lines.append("        .build()")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    text = kotlin(collect())
    if "--check" in argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print(f"stale: {OUT.relative_to(ROOT)} (run tools/icons/gen_android_icons.py)")
            return 1
        print("up to date")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({text.count(' by lazy {') - 1} icons)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
