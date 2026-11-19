"""Generate the Supabase Auth email templates in supabase/templates/ from one branded layout.

Run from the repo root: python tools/email/gen_auth_emails.py  (add --check to only verify the files are current).
Layout rules: tables and inline styles only (Gmail, Outlook, phone mail); no images, so the brand mark is drawn
with table cells and shows even when the client blocks images; never print the account email address in the body.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "supabase" / "templates"

FONT = "'Atkinson Hyperlegible Next','Atkinson Hyperlegible',Arial,Helvetica,sans-serif"
MONO = "'Courier New',Courier,monospace"
INK, MUTED, LINE, BG, SOFT = "#0e1b33", "#55617a", "#d3dbe6", "#f2f5f9", "#e6eefb"
PRIMARY, NAVY, ACCENT, ON_NAVY = "#0043b2", "#0e1b33", "#8db3fa", "#d3dbe6"

EMAILS = [
    {
        "file": "confirmacion.html",
        "subject": "Confirma tu correo en CLIMESA",
        "preheader": "Un paso más para activar tu cuenta de paciente.",
        "eyebrow": "Cuenta de paciente",
        "title": "Confirma tu correo",
        "lead": [
            "Recibimos tu registro en la app CLIMESA.",
            "Confirma que este correo es tuyo para activar tu cuenta.",
        ],
        "button": "Confirmar mi correo",
        "next": [
            "Después de confirmar, abre la app CLIMESA e inicia sesión con este correo y tu contraseña.",
            "Si Recepción ya anotó este correo en tu expediente, tu cuenta se une sola a él. Si no, pide en ventanilla que lo anoten.",
        ],
        "expiry": "El enlace vence en 24 horas y solo funciona una vez.",
    },
    {
        "file": "invitacion.html",
        "subject": "Tu invitación a CLIMESA",
        "preheader": "El hospital creó una cuenta de personal para ti.",
        "eyebrow": "Cuenta de personal",
        "title": "Te invitaron a CLIMESA",
        "lead": [
            "La administración del hospital CLIMESA creó una cuenta de personal para ti.",
            "Acepta la invitación y crea tu contraseña para empezar.",
        ],
        "button": "Aceptar la invitación",
        "next": ["Al terminar verás en qué aplicación trabaja tu rol: portal web, Android o iOS."],
        "expiry": "El enlace vence en 24 horas y solo funciona una vez. Si vence, pide a la administración que te invite de nuevo.",
    },
    {
        "file": "recuperacion.html",
        "subject": "Restablece tu contraseña de CLIMESA",
        "preheader": "Crea una contraseña nueva para tu cuenta.",
        "eyebrow": "Seguridad de la cuenta",
        "title": "Restablece tu contraseña",
        "lead": [
            "Pediste cambiar la contraseña de tu cuenta CLIMESA.",
            "Usa el botón para crear una contraseña nueva.",
        ],
        "button": "Crear una contraseña nueva",
        "next": [],
        "expiry": "El enlace vence en 1 hora y solo funciona una vez. Si vence, pide otro desde «¿Olvidaste tu contraseña?».",
    },
    {
        "file": "enlace-magico.html",
        "subject": "Tu enlace de acceso a CLIMESA",
        "preheader": "Entra a CLIMESA sin escribir tu contraseña.",
        "eyebrow": "Acceso a tu cuenta",
        "title": "Inicia sesión en CLIMESA",
        "lead": [
            "Pediste un enlace para iniciar sesión.",
            "Usa el botón para entrar sin escribir tu contraseña.",
        ],
        "button": "Iniciar sesión",
        "next": [],
        "expiry": "El enlace vence en 1 hora y solo funciona una vez.",
    },
    {
        "file": "cambio-correo.html",
        "subject": "Confirma tu nuevo correo en CLIMESA",
        "preheader": "Confirma el correo nuevo de tu cuenta.",
        "eyebrow": "Seguridad de la cuenta",
        "title": "Confirma tu nuevo correo",
        "lead": [
            "Pediste cambiar el correo de tu cuenta CLIMESA.",
            "Confirma el cambio para empezar a usar el correo nuevo.",
        ],
        "button": "Confirmar el cambio",
        "next": ["Hasta que lo confirmes, sigues entrando con tu correo actual."],
        "expiry": "El enlace vence en 24 horas y solo funciona una vez.",
    },
    {
        "file": "reverificacion.html",
        "subject": "Tu código de verificación de CLIMESA",
        "preheader": "Usa este código para confirmar el cambio en tu cuenta.",
        "eyebrow": "Seguridad de la cuenta",
        "title": "Tu código de verificación",
        "lead": ["Para cambiar la contraseña de tu cuenta CLIMESA, escribe este código en la app o en la web."],
        "code": True,
        "next": [],
        "expiry": "El código vence en pocos minutos y solo funciona una vez.",
    },
]


def p(text, size=16, line=24, color=INK, bottom=12):
    return f'<p style="margin:0 0 {bottom}px 0;font-family:{FONT};font-size:{size}px;line-height:{line}px;color:{color};">{text}</p>'


def mark():
    """A blue rounded square with a white cross, drawn with table cells (no image)."""
    w, b = "#ffffff", PRIMARY
    rows = [(b, w, b), (w, w, w), (b, w, b)]
    cells = "".join(
        "<tr>" + "".join(f'<td width="8" height="8" style="width:8px;height:8px;font-size:0;line-height:0;background-color:{c};">&nbsp;</td>' for c in r) + "</tr>"
        for r in rows
    )
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:{b};border-radius:8px;">'
        f'<tr><td style="padding:8px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">{cells}</table></td></tr></table>'
    )


def action(e):
    if e.get("code"):
        return (
            '<tr><td style="padding:8px 32px 8px 32px;">'
            f'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
            f'<td align="center" style="padding:16px 32px;background-color:{SOFT};border:1px solid {LINE};border-radius:6px;font-family:{MONO};font-size:32px;font-weight:bold;letter-spacing:8px;color:{INK};">{{{{ .Token }}}}</td>'
            "</tr></table></td></tr>"
        )
    return (
        '<tr><td style="padding:8px 32px 8px 32px;">'
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
        f'<td align="center" bgcolor="{PRIMARY}" style="border-radius:6px;">'
        f'<a href="{{{{ .ConfirmationURL }}}}" target="_blank" style="display:inline-block;padding:15px 28px;font-family:{FONT};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">{e["button"]}&nbsp;&nbsp;&rarr;</a>'
        "</td></tr></table></td></tr>"
        f'<tr><td style="padding:16px 32px 0 32px;">'
        + p("¿El botón no funciona? Copia este enlace en tu navegador:", 13, 19, MUTED, 6)
        + f'<div style="padding:10px 12px;background-color:{BG};border:1px solid {LINE};border-radius:6px;font-family:{MONO};font-size:12px;line-height:17px;color:{MUTED};word-break:break-all;">'
        f'<a href="{{{{ .ConfirmationURL }}}}" target="_blank" style="color:{PRIMARY};text-decoration:underline;">{{{{ .ConfirmationURL }}}}</a></div>'
        "</td></tr>"
    )


def security(e):
    items = [
        e["expiry"],
        "CLIMESA nunca te pedirá tu contraseña ni este " + ("código" if e.get("code") else "enlace") + " por teléfono, mensaje o correo.",
        "Si no pediste este correo, ignóralo: tu cuenta no cambia. Si te preocupa, avisa en Recepción.",
    ]
    rows = "".join(
        f'<tr><td valign="top" style="padding:0 8px 6px 0;font-family:{FONT};font-size:14px;line-height:20px;color:{PRIMARY};font-weight:bold;">&#10003;</td>'
        f'<td style="padding:0 0 6px 0;font-family:{FONT};font-size:14px;line-height:20px;color:{INK};">{t}</td></tr>'
        for t in items
    )
    return (
        '<tr><td style="padding:24px 32px 0 32px;">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{SOFT};border-left:4px solid {PRIMARY};border-radius:6px;">'
        f'<tr><td style="padding:14px 16px 10px 16px;">'
        f'<p style="margin:0 0 8px 0;font-family:{FONT};font-size:12px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:{PRIMARY};">Por tu seguridad</p>'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0">{rows}</table>'
        "</td></tr></table></td></tr>"
    )


def render(e):
    lead = "".join(p(t) for t in e["lead"])
    nxt = "".join(p(t, 15, 22, INK, 8) for t in e["next"])
    next_block = f'<tr><td style="padding:20px 32px 0 32px;">{nxt}</td></tr>' if nxt else ""
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{e["subject"]}</title>
</head>
<body style="margin:0;padding:0;background-color:{BG};">
<div style="display:none;max-height:0;overflow:hidden;">{e["preheader"]}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{BG};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid {LINE};border-radius:10px;">
        <tr>
          <td style="padding:20px 32px;background-color:{NAVY};border-radius:10px 10px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td valign="middle" style="padding:0 14px 0 0;">{mark()}</td>
              <td valign="middle" style="font-family:{FONT};color:#ffffff;">
                <div style="font-size:20px;line-height:24px;font-weight:bold;letter-spacing:1px;">CLIMESA</div>
                <div style="font-size:12px;line-height:16px;color:{ON_NAVY};">Hospital universitario</div>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:4px;font-size:0;line-height:0;background-color:{ACCENT};">&nbsp;</td></tr>
        <tr>
          <td style="padding:32px 32px 4px 32px;">
            <p style="margin:0 0 8px 0;font-family:{FONT};font-size:12px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:{PRIMARY};">{e["eyebrow"]}</p>
            <h1 style="margin:0 0 16px 0;font-family:{FONT};font-size:26px;line-height:32px;color:{INK};">{e["title"]}</h1>
            {lead}
          </td>
        </tr>
        {action(e)}
        {next_block}
        {security(e)}
        <tr>
          <td style="padding:28px 32px 24px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid {LINE};padding-top:16px;font-family:{FONT};font-size:12px;line-height:18px;color:{MUTED};">
              <strong style="color:{INK};">Hospital universitario CLIMESA</strong><br>
              Este es un correo automático de tu cuenta; no respondas a este mensaje.
            </td></tr></table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
"""


def main():
    check = "--check" in sys.argv
    stale = []
    for e in EMAILS:
        path = OUT / e["file"]
        html = render(e)
        assert "{{ .Email }}" not in html and "{{ .NewEmail }}" not in html, "never print the account email"
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != html:
                stale.append(e["file"])
        else:
            path.write_text(html, encoding="utf-8", newline="\n")
    if check and stale:
        sys.exit("out of date: " + ", ".join(stale))
    print("up to date" if check else f"wrote {len(EMAILS)} templates")


if __name__ == "__main__":
    main()
