#!/usr/bin/env python3
"""Generate the iOS icon set from the web icons (web is the source of truth).

Reads the SVG children of the 24-grid outline icons in:
  web/src/components/ui.tsx        (`paths`, the `Icon` set)
  web/src/components/identity.tsx  (`GLYPHS`, role and area identity glyphs)
  web/src/components/category.tsx  (`GLYPHS`, appointment request categories)

and writes ios/Core/ClimesaIcons.swift: `ClimesaIconName` (one case per icon) and the path data of each icon as
absolute move/line/cubic/close commands on the 24 grid. Rects (with rx and an optional rotate transform), circles,
relative commands, H/V and elliptical arcs are converted here, so the Swift side only parses M/L/C/Z.

Naming: `Icon` names stay as they are. An identity glyph with the same name and the same drawing is not repeated;
one with the same name and another drawing gets the `id` prefix (`idClipboard`). Category glyphs get `cat`.

Python standard library only. The output is deterministic: run it again and the file does not change.
Usage: python tools/icons/gen_ios_icons.py [--check]
"""
from __future__ import annotations

import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = [
    ("ui", ROOT / "web/src/components/ui.tsx", r"const paths: Record<IconName, ReactNode> = \{(.*?)\n\};"),
    ("id", ROOT / "web/src/components/identity.tsx", r"const GLYPHS: Record<IdentityIcon, ReactNode> = \{(.*?)\n\};"),
    ("cat", ROOT / "web/src/components/category.tsx", r"const GLYPHS: Record<string, ReactNode> = \{(.*?)\n\};"),
]
OUTPUT = ROOT / "ios/Core/ClimesaIcons.swift"
KAPPA = 0.5522847498307936  # cubic approximation of a quarter circle

ENTRY = re.compile(r"^\s*(\w+):\s*(.*?),\s*$", re.M)
ELEMENT = re.compile(r"<(path|rect|circle)\b([^>]*?)/>")
ATTR = re.compile(r'([\w-]+)="([^"]*)"')
TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
NUMBER = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


# ---------------------------------------------------------------------------------------------------------------------
# Geometry: every shape becomes a list of segments ("M", x, y) / ("L", x, y) / ("C", x1, y1, x2, y2, x, y) / ("Z",)

def arc_to_cubics(x1, y1, rx, ry, phi_deg, large, sweep, x2, y2):
    """SVG elliptical arc (endpoint form) to cubic segments of at most 90 degrees (SVG 1.1, appendix F.6)."""
    if (x1, y1) == (x2, y2):
        return []
    rx, ry = abs(rx), abs(ry)
    if rx == 0 or ry == 0:
        return [("L", x2, y2)]
    phi = math.radians(phi_deg % 360)
    cos_p, sin_p = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p = cos_p * dx + sin_p * dy
    y1p = -sin_p * dx + cos_p * dy
    lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lam > 1:
        scale = math.sqrt(lam)
        rx, ry = rx * scale, ry * scale
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    coef = math.sqrt(max(0.0, num / den)) if den else 0.0
    if large == sweep:
        coef = -coef
    cxp = coef * rx * y1p / ry
    cyp = -coef * ry * x1p / rx
    cx = cos_p * cxp - sin_p * cyp + (x1 + x2) / 2
    cy = sin_p * cxp + cos_p * cyp + (y1 + y2) / 2

    def angle(ux, uy, vx, vy):
        dot = ux * vx + uy * vy
        length = math.hypot(ux, uy) * math.hypot(vx, vy)
        value = math.acos(max(-1.0, min(1.0, dot / length)))
        return -value if ux * vy - uy * vx < 0 else value

    theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sweep and delta > 0:
        delta -= 2 * math.pi
    elif sweep and delta < 0:
        delta += 2 * math.pi
    pieces = max(1, math.ceil(abs(delta) / (math.pi / 2) - 1e-9))
    step = delta / pieces
    t = 4 / 3 * math.tan(step / 4)
    out = []
    a = theta1
    for index in range(pieces):
        b = a + step
        cos_a, sin_a, cos_b, sin_b = math.cos(a), math.sin(a), math.cos(b), math.sin(b)
        p1 = (cos_a - t * sin_a, sin_a + t * cos_a)
        p2 = (cos_b + t * sin_b, sin_b - t * cos_b)
        p3 = (cos_b, sin_b)

        def to_user(point):
            px, py = point[0] * rx, point[1] * ry
            return (cos_p * px - sin_p * py + cx, sin_p * px + cos_p * py + cy)

        c1, c2, end = to_user(p1), to_user(p2), to_user(p3)
        if index == pieces - 1:
            end = (x2, y2)  # land exactly on the arc's endpoint
        out.append(("C", c1[0], c1[1], c2[0], c2[1], end[0], end[1]))
        a = b
    return out


def parse_path(d: str):
    tokens = TOKEN.findall(d)
    segments = []
    i = 0
    cmd = None
    x = y = 0.0
    start_x = start_y = 0.0

    def number():
        nonlocal i
        value = float(tokens[i])
        i += 1
        return value

    def flag():
        # Arc flags may be packed against the next number ("a1 1 0 01 4 0"): read one digit.
        nonlocal i
        token = tokens[i]
        if token in ("0", "1"):
            i += 1
            return int(token)
        if token[0] in "01":
            tokens[i] = token[1:]
            return int(token[0])
        raise ValueError(f"bad arc flag {token!r} in {d!r}")

    while i < len(tokens):
        token = tokens[i]
        if token.isalpha():
            cmd = token
            i += 1
            if cmd in "Zz":
                segments.append(("Z",))
                x, y = start_x, start_y
                continue
        elif cmd is None:
            raise ValueError(f"path starts with a number: {d!r}")
        relative = cmd.islower()
        kind = cmd.upper()
        if kind == "M":
            nx, ny = number(), number()
            if relative:
                nx, ny = x + nx, y + ny
            segments.append(("M", nx, ny))
            x, y = start_x, start_y = nx, ny
            cmd = "l" if relative else "L"  # extra pairs after a move are lines
        elif kind == "L":
            nx, ny = number(), number()
            if relative:
                nx, ny = x + nx, y + ny
            segments.append(("L", nx, ny))
            x, y = nx, ny
        elif kind == "H":
            nx = number()
            x = x + nx if relative else nx
            segments.append(("L", x, y))
        elif kind == "V":
            ny = number()
            y = y + ny if relative else ny
            segments.append(("L", x, y))
        elif kind == "C":
            values = [number() for _ in range(6)]
            if relative:
                values = [v + (x if k % 2 == 0 else y) for k, v in enumerate(values)]
            segments.append(("C", *values))
            x, y = values[4], values[5]
        elif kind == "S":
            # Smooth cubic: the first control point mirrors the previous cubic's second one (or is the current point).
            values = [number() for _ in range(4)]
            if relative:
                values = [v + (x if k % 2 == 0 else y) for k, v in enumerate(values)]
            last = segments[-1] if segments else None
            if last and last[0] == "C":
                c1 = (2 * x - last[3], 2 * y - last[4])
            else:
                c1 = (x, y)
            segments.append(("C", c1[0], c1[1], *values))
            x, y = values[2], values[3]
        elif kind == "A":
            rx, ry, rot = number(), number(), number()
            large, sweep = flag(), flag()
            nx, ny = number(), number()
            if relative:
                nx, ny = x + nx, y + ny
            segments.extend(arc_to_cubics(x, y, rx, ry, rot, large, sweep, nx, ny))
            x, y = nx, ny
        else:
            raise ValueError(f"unsupported path command {cmd!r} in {d!r}")
    return segments


def circle(cx, cy, r):
    k = KAPPA * r
    return [
        ("M", cx + r, cy),
        ("C", cx + r, cy + k, cx + k, cy + r, cx, cy + r),
        ("C", cx - k, cy + r, cx - r, cy + k, cx - r, cy),
        ("C", cx - r, cy - k, cx - k, cy - r, cx, cy - r),
        ("C", cx + k, cy - r, cx + r, cy - k, cx + r, cy),
        ("Z",),
    ]


def rect(x, y, w, h, rx):
    rx = min(rx, w / 2, h / 2)
    if rx <= 0:
        return [("M", x, y), ("L", x + w, y), ("L", x + w, y + h), ("L", x, y + h), ("Z",)]
    k = KAPPA * rx
    r, b = x + w, y + h
    return [
        ("M", x + rx, y),
        ("L", r - rx, y),
        ("C", r - rx + k, y, r, y + rx - k, r, y + rx),
        ("L", r, b - rx),
        ("C", r, b - rx + k, r - rx + k, b, r - rx, b),
        ("L", x + rx, b),
        ("C", x + rx - k, b, x, b - rx + k, x, b - rx),
        ("L", x, y + rx),
        ("C", x, y + rx - k, x + rx - k, y, x + rx, y),
        ("Z",),
    ]


def apply_transform(segments, transform):
    if not transform:
        return segments
    match = re.fullmatch(r"\s*rotate\(([^)]*)\)\s*", transform)
    if not match:
        raise ValueError(f"unsupported transform {transform!r}")
    values = [float(v) for v in NUMBER.findall(match.group(1))]
    angle, cx, cy = (values + [0.0, 0.0])[:3] if len(values) == 1 else values
    cos_a, sin_a = math.cos(math.radians(angle)), math.sin(math.radians(angle))

    def rotate(px, py):
        dx, dy = px - cx, py - cy
        return (cx + dx * cos_a - dy * sin_a, cy + dx * sin_a + dy * cos_a)

    out = []
    for segment in segments:
        if segment[0] == "Z":
            out.append(segment)
            continue
        coords = list(segment[1:])
        rotated = []
        for k in range(0, len(coords), 2):
            rotated.extend(rotate(coords[k], coords[k + 1]))
        out.append((segment[0], *rotated))
    return out


def element_segments(tag, attrs):
    if tag == "path":
        return apply_transform(parse_path(attrs["d"]), attrs.get("transform"))
    if tag == "circle":
        return apply_transform(circle(float(attrs["cx"]), float(attrs["cy"]), float(attrs["r"])), attrs.get("transform"))
    if tag == "rect":
        shape = rect(float(attrs.get("x", 0)), float(attrs.get("y", 0)), float(attrs["width"]), float(attrs["height"]), float(attrs.get("rx", 0)))
        return apply_transform(shape, attrs.get("transform"))
    raise ValueError(tag)


# ---------------------------------------------------------------------------------------------------------------------
# Sources and output

def read_source(path: Path, pattern: str):
    text = path.read_text(encoding="utf-8")
    block = re.search(pattern, text, re.S)
    if not block:
        raise SystemExit(f"icon table not found in {path}")
    icons = []
    for match in ENTRY.finditer(block.group(1)):
        name, body = match.group(1), match.group(2)
        segments = []
        for tag, raw in ELEMENT.findall(body):
            segments.extend(element_segments(tag, dict(ATTR.findall(raw))))
        if not segments:
            raise SystemExit(f"icon {name} in {path} has no drawable element")
        icons.append((name, body.strip(), segments))
    return icons


def fmt(value: float) -> str:
    value = round(value, 3)
    if value == 0:
        value = 0.0  # no "-0"
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return text


def path_data(segments) -> str:
    parts = []
    for segment in segments:
        parts.append(segment[0])
        parts.extend(fmt(v) for v in segment[1:])
    return " ".join(parts)


def collect():
    ui, identity, category = (read_source(path, pattern) for _, path, pattern in SOURCES)
    names: dict[str, tuple[str, str]] = {}  # case -> (path data, origin)
    order: list[str] = []
    ui_bodies = {}
    for name, body, segments in ui:
        names[name] = (path_data(segments), "Icon")
        ui_bodies[name] = body
        order.append(name)
    for name, body, segments in identity:
        data = path_data(segments)
        if name in names:
            if names[name][0] == data:
                continue
            name = "id" + name[0].upper() + name[1:]
        names[name] = (data, "IdentityGlyph")
        order.append(name)
    for name, body, segments in category:
        case = "cat" + name[0].upper() + name[1:]
        names[case] = (path_data(segments), "CategoryGlyph")
        order.append(case)
    return order, names


def render(order, names) -> str:
    lines = [
        "// GENERATED by tools/icons/gen_ios_icons.py from web/src/components/{ui,identity,category}.tsx. Do not edit.",
        "// Run `python tools/icons/gen_ios_icons.py` after a web icon changes.",
        "import Foundation",
        "",
        "/// The web icon set (24-grid outline icons, stroke 1.7, round caps and joins), one case per web icon name.",
        "/// `Icon` names keep their web name; identity glyphs that differ from an `Icon` of the same name use `id`, and",
        "/// appointment category glyphs use `cat`.",
        "public enum ClimesaIconName: String, CaseIterable, Sendable {",
    ]
    for case in order:
        lines.append(f"    case {case}")
    lines += [
        "}",
        "",
        "/// One drawing step of an icon on the 24 grid.",
        "public enum ClimesaIconSegment: Equatable, Sendable {",
        "    case move(Double, Double)",
        "    case line(Double, Double)",
        "    case cubic(Double, Double, Double, Double, Double, Double)",
        "    case close",
        "}",
        "",
        "public enum ClimesaIconGeometry {",
        "    /// Grid size of every icon (the web `viewBox=\"0 0 24 24\"`).",
        "    public static let grid: Double = 24",
        "    /// Stroke width on the 24 grid (web `strokeWidth=\"1.7\"`).",
        "    public static let stroke: Double = 1.7",
        "",
        "    /// Absolute commands separated by spaces: `M x y`, `L x y`, `C x1 y1 x2 y2 x y`, `Z`.",
        "    public static func pathData(_ name: ClimesaIconName) -> String {",
        "        switch name {",
    ]
    for case in order:
        lines.append(f'        case .{case}: return "{names[case][0]}"')
    lines += [
        "        }",
        "    }",
        "",
        "    /// The drawing steps of an icon. Unknown tokens are skipped, so a malformed string draws less, never crashes.",
        "    public static func segments(_ name: ClimesaIconName) -> [ClimesaIconSegment] { parse(pathData(name)) }",
        "",
        "    public static func parse(_ data: String) -> [ClimesaIconSegment] {",
        "        let tokens = data.split(separator: \" \")",
        "        var out: [ClimesaIconSegment] = []",
        "        var index = 0",
        "        func values(_ count: Int) -> [Double]? {",
        "            guard index + count <= tokens.count else { return nil }",
        "            var result: [Double] = []",
        "            for offset in 0..<count {",
        "                guard let value = Double(String(tokens[index + offset])) else { return nil }",
        "                result.append(value)",
        "            }",
        "            index += count",
        "            return result",
        "        }",
        "        while index < tokens.count {",
        "            let command = tokens[index]",
        "            index += 1",
        "            switch command {",
        "            case \"M\": if let v = values(2) { out.append(.move(v[0], v[1])) }",
        "            case \"L\": if let v = values(2) { out.append(.line(v[0], v[1])) }",
        "            case \"C\": if let v = values(6) { out.append(.cubic(v[0], v[1], v[2], v[3], v[4], v[5])) }",
        "            case \"Z\": out.append(.close)",
        "            default: continue",
        "            }",
        "        }",
        "        return out",
        "    }",
        "}",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    order, names = collect()
    content = render(order, names)
    if "--check" in sys.argv:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != content:
            print(f"{OUTPUT.relative_to(ROOT)} is out of date; run tools/icons/gen_ios_icons.py", file=sys.stderr)
            return 1
        print(f"{OUTPUT.relative_to(ROOT)} is up to date ({len(order)} icons)")
        return 0
    OUTPUT.write_bytes(content.encode("utf-8"))
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(order)} icons)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
