"""End-to-end walkthrough of the demo through the real UI (Playwright). Requires a freshly reset demo database
(tests/e2e/reset-demo.sh) and the web app on http://127.0.0.1:5007. Usage: python3 tests/e2e/walkthrough.py <screenshot dir>"""
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5007"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/shots")
OUT.mkdir(parents=True, exist_ok=True)
CSV = str(Path(__file__).resolve().parents[2] / "docs" / "demo" / "indice_archivo_muestra.csv")
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f" :: {detail}" if detail and not cond else ""))


def login(page, user):
    page.goto(f"{BASE}/Cuenta/Login")
    page.fill("input[name=Username]", user)
    page.fill("input[name=Password]", "Demo2026!")
    page.click("button:has-text('Ingresar')")
    page.wait_for_load_state("networkidle")


def logout(page):
    page.context.clear_cookies()


def shot(page, name):
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)


def body(page):
    return page.inner_text("main")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    # 1. Archive index migration
    login(page, "archivo1")
    page.goto(f"{BASE}/Migracion")
    page.set_input_files("input[name=File]", CSV)
    page.click("button:has-text('Cargar')")
    page.wait_for_load_state("networkidle")
    text = body(page)
    check("migration batch completed and balanced", "conciliado" in text and "11 leídas" in text, text[:400])
    check("full-name row pending split", "name_split_required" in text)
    check("invalid DUI rejected", "dui_invalid" in text)
    check("missing legacy number rejected", "legacy_number_missing" in text)
    check("legacy number reused with other name goes to conflict", "legacy_identifier_conflict" in text)
    check("phonetic duplicate opens case", "possible_duplicate" in text and "caso abierto" in text)
    check("impossible date rejected", "birth_invalid" in text)
    check("characters preserved in sample", "Muñoz Peña" in text and "true" in text)
    shot(page, "01_migracion_lote")
    page.goto(f"{BASE}/Migracion")
    page.set_input_files("input[name=File]", CSV)
    page.click("button:has-text('Cargar')")
    page.wait_for_load_state("networkidle")
    check("same file twice has no new effect", "ya se cargó" in body(page))
    page.goto(f"{BASE}/Pacientes/Duplicados")
    check("duplicate case listed", "carga de archivo" in body(page))
    logout(page)

    # 2. Admission: search before create, phonetic search, register, duplicate DUI
    login(page, "admision1")
    page.goto(f"{BASE}/Pacientes?Text=hernandes+basquez+jose")
    text = body(page)
    check("phonetic search finds Hernández Vásquez", "Hernández Vásquez" in text and "fonéticamente" in text, text[:300])
    shot(page, "02_busqueda_fonetica")
    page.goto(f"{BASE}/Pacientes/Nuevo?token=00000000-0000-0000-0000-000000000000")
    page.fill("input[name=GivenNames]", "Prueba")
    page.fill("input[name=FirstSurname]", "Sin Busqueda")
    page.click("button:has-text('Registrar')")
    page.wait_for_load_state("networkidle")
    check("register without search is refused", "Debe buscar al paciente" in body(page))
    page.goto(f"{BASE}/Pacientes?Text=Beatriz+Alvarenga")
    page.click("a:has-text('Registrar paciente nuevo')")
    page.fill("input[name=GivenNames]", "Beatriz Eugenia")
    page.fill("input[name=FirstSurname]", "Alvarenga")
    page.fill("input[name=SecondSurname]", "Chávez")
    page.fill("input[name=BirthDate]", "1988-09-21")
    page.fill("input[name=Dui]", "055667784")
    page.fill("input[name=Municipality]", "Santa Ana Centro")
    page.fill("input[name=Informant]", "la paciente")
    page.click("button:has-text('Registrar')")
    page.wait_for_load_state("networkidle")
    text = body(page)
    check("registered with normalized DUI and MRN", "05566778-4" in text and re.search(r"\d{7}-[0-9X]", text) is not None, text[:300])
    shot(page, "03_paciente_registrado")
    page.goto(f"{BASE}/Pacientes?Text=Otra+Persona")
    page.click("a:has-text('Registrar paciente nuevo')")
    page.fill("input[name=GivenNames]", "Otra")
    page.fill("input[name=FirstSurname]", "Persona")
    page.fill("input[name=BirthDate]", "1990-01-01")
    page.fill("input[name=Dui]", "05566778-4")
    page.click("button:has-text('Registrar')")
    page.wait_for_load_state("networkidle")
    check("same DUI on another person refused", "ya pertenece al expediente" in body(page))
    page.goto(f"{BASE}/Pacientes?Dui=05566778-5")
    check("search by DUI with wrong check digit finds nobody", "0 candidato" in body(page), body(page)[:200])
    logout(page)

    # 3. Emergency: provisional arrival and triage
    login(page, "triage1")
    page.goto(f"{BASE}/Emergencia")
    page.fill("input[name=Description]", "hombre adulto inconsciente, camisa azul")
    page.fill("input[name=EstimatedAge]", "45")
    page.select_option("select[name=Sex]", "male")
    page.click("button:has-text('Registrar llegada')")
    page.wait_for_load_state("networkidle")
    check("emergency arrival without data", "Llegada registrada" in body(page))
    page.click("a:has-text('Triaje') >> nth=0")
    page.select_option("select[name=Level]", "2")
    page.fill("input[name=Discriminator]", "alteración de conciencia, Glasgow 10")
    page.fill("input[name=SpO2]", "91")
    page.click("button:has-text('Guardar triaje')")
    page.wait_for_load_state("networkidle")
    check("triage recorded", "Triaje registrado" in body(page))
    shot(page, "04_emergencia_tablero")
    logout(page)

    login(page, "admision1")
    page.goto(f"{BASE}/Emergencia/Triaje/00000000-0000-0000-0000-000000000000")
    page.click("button:has-text('Guardar triaje')")
    page.wait_for_load_state("networkidle")
    check("reception cannot triage", "permiso" in body(page))
    logout(page)

    # 4. Physician: first contact, admission, discharge rules
    login(page, "medico1")
    page.goto(f"{BASE}/Emergencia")
    page.click("button:has-text('Primer contacto') >> nth=0")
    page.wait_for_load_state("networkidle")
    page.click("a:has-text('Ingresar') >> nth=0")
    page.wait_for_load_state("networkidle")
    page.select_option("select[name=LocationId]", label="MI-201 · Medicina interna")
    page.click("button:has-text('Ingresar')")
    page.wait_for_load_state("networkidle")
    check("admitted to MI-201", "Paciente ingresado" in body(page) and "MI-201" in body(page), body(page)[:300])
    episode_url = page.url
    page.fill("input[name=Pending1]", "hemocultivo en proceso")
    page.click("button:has-text('Firmar alta')")
    page.wait_for_load_state("networkidle")
    check("discharge blocked until pending has owner", "necesita un responsable" in body(page))
    page.select_option("select[name=Type]", "voluntary")
    page.click("button:has-text('Firmar alta')")
    page.wait_for_load_state("networkidle")
    check("voluntary discharge needs form or witnesses", "Alta voluntaria" in body(page) and "testigos" in body(page))
    page.select_option("select[name=Type]", "medical")
    page.fill("input[name=Pending1]", "hemocultivo en proceso")
    page.fill("input[name=Owner1]", "Dr. Ernesto Aguilar, consulta externa")
    page.click("button:has-text('Firmar alta')")
    page.wait_for_load_state("networkidle")
    check("medical discharge signed with license", "Alta médica firmada" in body(page) and "JVPM 11873" in body(page))
    shot(page, "05_episodio_alta_firmada")
    logout(page)

    login(page, "medico2")
    page.goto(f"{BASE}/Emergencia")
    logout(page)

    # 5. Exit sends bed to cleaning; cleaning needs a different signer
    login(page, "triage1")
    page.goto(episode_url)
    page.click("button:has-text('Registrar salida física')")
    page.wait_for_load_state("networkidle")
    check("physical exit recorded", "Salida física registrada" in body(page))
    page.goto(f"{BASE}/Camas")
    check("bed MI-201 pending cleaning", re.search(r"MI-201\s+pendiente de limpieza", body(page)) is not None)
    logout(page)

    login(page, "limpieza1")
    page.goto(f"{BASE}/Camas")
    bed = page.locator(".bed", has_text="MI-201")
    bed.locator("summary").click()
    boxes = bed.locator("input[type=checkbox]")
    for i in range(boxes.count() - 1):
        boxes.nth(i).check()
    from datetime import datetime, timedelta, timezone
    local_now = datetime.now(timezone.utc) - timedelta(hours=6)
    bed.locator("input[name=Started]").fill((local_now - timedelta(minutes=45)).strftime("%Y-%m-%dT%H:%M"))
    bed.locator("input[name=Ended]").fill((local_now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M"))
    bed.locator("button:has-text('Guardar')").click()
    page.wait_for_load_state("networkidle")
    check("cleaning registered (one item unchecked)", "Limpieza registrada" in body(page))
    logout(page)

    login(page, "jefe1")
    page.goto(f"{BASE}/Camas")
    page.click("button:has-text('Firmar y liberar')")
    page.wait_for_load_state("networkidle")
    check("incomplete checklist cannot release bed", "No se puede liberar" in body(page))
    shot(page, "06_camas_limpieza")
    logout(page)

    # 6. Expired license: second admission and discharge attempt by medico2
    login(page, "triage1")
    page.goto(f"{BASE}/Emergencia")
    page.fill("input[name=Description]", "mujer adulta, dolor abdominal")
    page.click("button:has-text('Registrar llegada')")
    page.wait_for_load_state("networkidle")
    logout(page)
    login(page, "medico2")
    page.goto(f"{BASE}/Emergencia")
    page.click("a:has-text('Ingresar') >> nth=0")
    page.wait_for_load_state("networkidle")
    page.click("button:has-text('Ingresar')")
    page.wait_for_load_state("networkidle")
    page.click("button:has-text('Firmar alta')")
    page.wait_for_load_state("networkidle")
    check("expired license cannot sign discharge", "inscripción profesional vigente" in body(page), body(page)[:300])
    logout(page)

    # 7. Audit trail and chain verification
    login(page, "auditor1")
    page.goto(f"{BASE}/Auditoria")
    page.click("button:has-text('Verificar integridad')")
    page.wait_for_load_state("networkidle")
    text = body(page)
    check("audit chain verifies", "Cadena íntegra" in text, text[:200])
    check("denied attempts are audited", "denegado" in text)
    shot(page, "07_auditoria")
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
