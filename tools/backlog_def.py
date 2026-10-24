"""Backlog para Jira: historias de usuario con puntos relativos a la historia pivote, importancia, módulo y sprint.

Qué hay que hacer:     specs/*/tasks.md (fuente de verdad del trabajo y de su verificación).
Historias y estimación: este archivo.
Asignación a personas:  NO va aquí (D-076); la hace quien administra el tablero, por componente.
"""

# ---------------- Calendario (D-075) ----------------
SPRINTS = {
    "S1": ("Sprint 1", "17 al 23 de octubre", "Semana 1 del curso, planificación y diseño: investigación, requisitos, propuesta, esquematización, modelo de datos y base de datos en la nube, Jira, Figma y diseño de alta fidelidad"),
    "S2": ("Sprint 2", "24 al 30 de octubre", "Semana 2, autenticación y base de datos: login por roles, maquetación base en Xcode, Kotlin y web, estructura de habitaciones y turnos, tiempo real. Cierra con la entrega de avance del 31 de octubre (50% de la nota)"),
    "S3": ("Sprint 3", "31 de octubre al 6 de noviembre", "Semana 3, módulos principales: consulta general, flujo de laboratorio, fila y citas, panel de administración, inventario, vinculación del paciente, privacidad clínica"),
    "S4": ("Sprint 4", "7 al 13 de noviembre", "Semana 4, lógica avanzada: admisión y algoritmo de asignación de habitaciones (plantas 2 y 3), recurso único de la ambulancia, permisos de privacidad, accesos excepcionales y auditoría"),
    "S5": ("Sprint 5", "14 al 20 de noviembre", "Semana 5, pruebas e integración: conexión completa de las 3 plataformas, pruebas de concurrencia y de clientes, corrección de errores, pulido visual, documento de arquitectura y ensayo. Defensa: sábado 21 de noviembre"),
    "BL": ("Backlog", "sin sprint", "Extras de prioridad Baja que el curso no exige. Entran a un sprint solo si sobra capacidad"),
}
CAPACIDAD = {"S2": 75, "S3": 75, "S4": 75, "S5": 75, "BL": None}   # puntos planeados por sprint (supuesto inicial; recalibrar en cada revisión)

# ---------------- Componentes de Jira ----------------
COMPONENTES = {
    "BE": "Backend y base de datos",
    "WEB": "Web (React)",
    "AND": "Android (Kotlin)",
    "IOS": "iOS (SwiftUI)",
    "QA": "Calidad y pruebas",
    "DIS": "Diseño (Figma)",
    "DOC": "Documentación y gestión",
}

# ---------------- Importancia ----------------
PRIORIDADES = {
    "Highest": ("Crítica", "Sin esto no hay avance del 31 de octubre (50% de la nota)."),
    "High": ("Alta", "Lo exige el documento del curso para la entrega final del 21 de noviembre."),
    "Medium": ("Media", "Extra de alto valor que se ve en la defensa (tiempo real con aviso, prehospital, push)."),
    "Low": ("Baja", "Extra útil que el curso no exige; queda en el backlog sin sprint."),
    "Lowest": ("Fuera del curso", "Diseñado para producción CLIMESA (nivel F); no entra en ningún sprint."),
}

# ---------------- Historia pivote y escala (D-076) ----------------
PIVOTE = {
    "id": "HU-102-1",
    "puntos": 3,
    "texto": "Como recepcionista, quiero buscar a un paciente antes de registrarlo y registrarlo si no existe, en web y en Android, para no crear expedientes duplicados.",
    "por_que": "Todos la entienden, toca las tres capas típicas (base de datos, API, pantalla web y pantalla Android), tiene una validación de negocio real (DUI con dígito verificador, buscar antes de crear) y ninguna incertidumbre técnica grande.",
}
ESCALA = [
    (1, "Un tercio de la pivote: un ajuste en una sola capa. Ejemplo: publicar médicos de turno desde una vista que ya existe."),
    (2, "Menos que la pivote: una capa completa o dos capas sencillas. Ejemplo: traslados con la regla VIP."),
    (3, "Igual a la pivote."),
    (5, "Casi el doble: varias capas con una regla difícil o tiempo real. Ejemplo: fila del día con llamado en vivo en las apps."),
    (8, "Casi el triple: varias plataformas más concurrencia o incertidumbre. Ejemplo: asignación de cama con conflicto entre dos personas."),
    (13, "Demasiado grande: se parte antes de entrar a un sprint."),
]

# ---------------- Componentes de cada tarea de spec ----------------
TAREAS = {
    "100-T01": ["BE"], "100-T02": ["BE"], "100-T03": ["BE"], "100-T04": ["BE"], "100-T05": ["BE"], "100-T06": ["BE"],
    "100-T07": ["BE"], "100-T08": ["BE"], "100-T09": ["BE"], "100-T10": ["BE"],
    "101-T01": ["BE"], "101-T02": ["BE"], "101-T03": ["BE"], "101-T04": ["BE"], "101-T05": ["BE", "WEB"],
    "101-T06": ["WEB", "AND", "IOS"], "101-T07": ["BE", "WEB", "AND", "IOS"], "101-T08": ["BE", "AND", "IOS"],
    "102-T01": ["BE"], "102-T02": ["BE"], "102-T03": ["BE"], "102-T04": ["BE"], "102-T05": ["WEB", "AND"],
    "102-T06": ["BE", "AND"], "102-T07": ["BE"],
    "103-T01": ["BE"], "103-T02": ["BE"], "103-T03": ["BE"], "103-T04": ["WEB"], "103-T05": ["BE"], "103-T06": ["BE"],
    "103-T07": ["WEB", "AND", "IOS"], "103-T08": ["BE"], "103-T09": ["BE", "WEB"],
    "104-T01": ["BE"], "104-T02": ["BE"], "104-T03": ["BE"], "104-T04": ["BE"], "104-T05": ["WEB"],
    "104-T06": ["BE", "AND"], "104-T07": ["BE", "WEB"],
    "105-T01": ["BE"], "105-T02": ["BE"], "105-T03": ["AND", "IOS"], "105-T04": ["BE", "WEB", "AND"],
    "105-T05": ["BE", "WEB", "AND", "IOS"], "105-T06": ["BE", "WEB"],
    "106-T01": ["BE"], "106-T02": ["BE"], "106-T03": ["BE"], "106-T04": ["BE", "AND", "IOS"], "106-T05": ["AND", "IOS"],
    "106-T06": ["BE", "AND", "IOS"], "106-T07": ["BE", "AND", "IOS"],
    "107-T01": ["BE"], "107-T02": ["BE"], "107-T03": ["BE"], "107-T04": ["WEB", "AND"], "107-T05": ["BE", "AND", "IOS"],
    "107-T06": ["BE", "AND", "IOS"], "107-T07": ["BE"],
    "108-T01": ["BE"], "108-T02": ["BE"], "108-T03": ["BE"], "108-T04": ["BE"], "108-T05": ["BE", "WEB"], "108-T06": ["BE"],
    "108-T07": ["WEB", "AND"], "108-T08": ["BE", "AND", "IOS"], "108-T09": ["BE"], "108-T10": ["BE", "AND"],
    "109-T01": ["BE"], "109-T02": ["BE"], "109-T03": ["BE"], "109-T04": ["BE"], "109-T05": ["WEB", "AND"],
    "109-T06": ["AND", "IOS"], "109-T07": ["BE", "WEB", "AND"], "109-T08": ["BE"], "109-T09": ["BE", "AND"],
    "109-T10": ["BE", "WEB", "AND"],
    "110-T01": ["BE"], "110-T02": ["BE"], "110-T03": ["BE"], "110-T04": ["BE", "WEB"], "110-T05": ["WEB", "AND", "IOS"],
    "110-T06": ["DOC"], "110-T07": ["BE", "AND", "IOS"], "110-T08": ["BE", "AND", "IOS"],
    "111-T01": ["BE"], "111-T02": ["BE"], "111-T03": ["BE", "WEB"], "111-T04": ["AND"],
    "112-T01": ["BE"], "112-T02": ["BE", "WEB", "AND", "IOS"], "112-T03": ["WEB"],
    "113-T01": ["BE", "WEB"], "113-T02": ["BE", "WEB"], "113-T03": ["BE", "WEB"], "113-T04": ["BE", "WEB"],
    "114-T01": ["WEB", "AND", "IOS"], "114-T02": ["WEB", "AND", "IOS"], "114-T03": ["BE", "WEB", "AND", "IOS"],
    "120-T01": ["WEB"], "120-T02": ["WEB"], "120-T03": ["WEB"], "120-T04": ["WEB"], "120-T05": ["WEB", "QA"],
    "121-T01": ["AND"], "121-T02": ["AND"], "121-T03": ["AND"], "121-T04": ["AND"], "121-T05": ["AND"], "121-T06": ["AND"],
    "122-T01": ["IOS"], "122-T02": ["IOS"], "122-T03": ["IOS"], "122-T04": ["IOS"], "122-T05": ["IOS"],
    "130-T01": ["BE"], "130-T02": ["WEB"], "130-T03": ["BE"], "130-T04": ["BE"], "130-T05": ["BE"], "130-T06": ["QA"],
    "131-T01": ["DOC"], "131-T02": ["DOC"], "131-T03": ["DIS"], "131-T04": ["BE"], "131-T05": ["QA", "DOC"], "131-T06": ["DOC", "QA"],
}

# Trabajo de gestión, diseño y calidad que no está en tasks.md: (id, componente, título, hecho cuando, hecho?)
EXTRA = {
    "GES-01": ("DOC", "Proyecto de Jira con épicas, componentes, sprints y campo de story points", "El tablero refleja este backlog y sus 5 sprints", True),
    "GES-02": ("DIS", "Diseño de alta fidelidad de las 116 pantallas, sistema de diseño claro y oscuro, y 16 flujos en Claude Design", "docs/diseno/claude-design/ contiene las pantallas con códigos W, A e I", True),
    "GES-03": ("DIS", "Llevar el diseño a Figma: páginas por plataforma y rol, componentes con variantes", "Cada archivo de claude-design/ tiene su página en Figma", False),
    "GES-04": ("DIS", "Enlazar los flujos F01 a F12 como prototipo interactivo en Figma", "Cada flujo navega de punta a punta", False),
    "GES-05": ("QA", "Revisión de accesibilidad del diseño: contraste, tamaños táctiles, estados sin color", "Lista de verificación firmada", False),
    "GES-06": ("QA", "Plantilla de casos de prueba y de reporte de defectos en Jira", "Plantilla aprobada y usada en el primer caso", False),
    "GES-07": ("QA", "Usuarios de prueba por rol y pacientes ficticios en el entorno de nube", "Un usuario por cada uno de los 10 roles puede ingresar", False),
    "GES-08": ("WEB", "Inicio local del proyecto web (sin evidencia en el repositorio)", "Se sube al repositorio en HU-120-1", True),
    "GES-10": ("DOC", "Investigación de CLIMESA, del sector hospitalario y de sistemas de referencia", "Hallazgos incorporados a specs, decisiones y reglas de negocio", True),
    "GES-11": ("DOC", "Recolección de datos y toma de requisitos del curso y del cliente", "Requisitos del curso y respuestas del cliente registrados en docs/curso y docs/decisiones", True),
    "GES-12": ("DOC", "Documento estructurado de la propuesta de desarrollo del software", "Propuesta entregada al docente", True),
    "GES-13": ("DOC", "Esquematización inicial: arquitectura, módulos, roles y specs SDD", "Constitución, arquitectura y specs 100 a 131 escritas", True),
    "GES-14": ("DIS", "Base de Figma: archivo, estructura de páginas y prototipo inicial", "Archivo de Figma creado con su estructura", True),
    "GES-15": ("BE", "Configurar Supabase para la API: contraseña del rol sghu_api, gancho de token acceso.hook_token, primer Administrador, limpiar la fila de humo del outbox", "La API se conecta como sghu_api, el token trae roles y canales, existe un usuario ADM (pasos en supabase/README.md)", False),
    "GES-09": ("AND", "Inicio local del proyecto Android (sin evidencia en el repositorio)", "Se sube al repositorio en HU-121-1", True),
}

# ---------------- Historias ----------------
# (id, épica, como, quiero, para, tareas, puntos, prioridad, sprint, pantallas, criterios)
H = []


def h(*a):
    H.append(a)


# Épica 131 y gestión: lo hecho en el sprint 1 y lo de diseño para el avance
h("HU-131-00", "131", "equipo", "investigar el dominio, levantar los requisitos y documentar la propuesta",
  "construir el sistema sobre una base acordada", ["GES-10", "GES-11", "GES-12", "GES-13"], 5, "Highest", "S1", "",
  ["Investigación de CLIMESA y del sector documentada", "Requisitos del curso y del cliente levantados como specs SDD", "Documento de la propuesta entregado", "Arquitectura y módulos esquematizados"])
h("HU-100-0", "100", "equipo de desarrollo", "el modelo de datos y la base de datos en la nube con sus invariantes",
  "que todos los módulos construyan sobre la misma estructura", ["100-T03", "101-T01", "101-T02", "102-T01", "103-T01", "104-T01", "105-T01", "106-T01", "107-T01", "108-T01", "109-T01", "111-T01"], 8, "Highest", "S1", "",
  ["13 migraciones aplicadas en Supabase", "Cama, turnos y citas sin traslape por restricciones de exclusión", "RLS en todas las tablas", "28 invariantes y 6 pruebas concurrentes pasan"])
h("HU-131-0", "131", "equipo", "un tablero de Jira y el diseño de alta fidelidad de todas las pantallas",
  "planificar y construir sobre lo mismo", ["GES-01", "GES-02", "GES-14", "GES-08", "GES-09"], 5, "Highest", "S1", "Todas",
  ["Jira con épicas y sprints", "116 pantallas diseñadas con estados y modo oscuro"])
h("HU-131-1", "131", "docente evaluador", "el diseño completo en Figma con flujos enlazados y revisado en accesibilidad",
  "evaluar el 100% del diseño en el avance", ["GES-03", "GES-04", "GES-05", "131-T03"], 3, "Highest", "S2", "Todas",
  ["Figma con las pantallas de iOS, Android y web", "Flujos F01 a F12 enlazados", "Sistema de diseño con paleta accesible y estados"])
h("HU-131-2", "131", "docente evaluador", "el diagrama entidad-relación, la arquitectura, la matriz RBAC y la política de privacidad",
  "evaluar la arquitectura en el avance", ["131-T01", "110-T06"], 1, "Highest", "S2", "",
  ["Los cuatro documentos en docs/arquitectura", "La matriz se genera y verifica desde los catálogos"])
h("HU-131-3", "131", "miembro del equipo", "un README que explique cómo instalar y correr las tres plataformas",
  "que cualquiera levante el proyecto", ["131-T02"], 2, "Highest", "S2", "",
  ["Un compañero levanta el entorno siguiendo el README"])
h("HU-131-4", "131", "equipo de QA", "plantillas de casos, usuarios de prueba por rol y la lista de pruebas por pantalla",
  "probar desde el primer sprint de código", ["GES-06", "GES-07", "130-T06"], 2, "Highest", "S2", "Todas",
  ["Un usuario por rol", "Lista de pruebas por pantalla y estado"])
h("HU-131-5", "131", "docente evaluador", "el documento de arquitectura en PDF, el entorno de demostración restaurable y la defensa ensayada",
  "evaluar la entrega final", ["131-T04", "131-T05", "131-T06"], 5, "High", "S5", "",
  ["PDF con diagramas, RBAC y privacidad", "Entorno demo en un comando", "Dos ensayos completos de 15 minutos"])

# Épica 100 Plataforma
h("HU-100-1", "100", "equipo de desarrollo", "una API base con autenticación de Supabase, permisos, auditoría e idempotencia",
  "que cada módulo nazca protegido y trazable", ["100-T01", "100-T02", "100-T04", "100-T05", "100-T06"], 8, "Highest", "S2", "W36",
  ["Token inválido responde 401", "Sin permiso responde 403 y queda auditado", "Doble clic no duplica efectos"])
h("HU-100-2", "100", "equipo de desarrollo", "la API publicada en la nube con su contrato OpenAPI y la base de datos con tiempo real",
  "que las tres apps la consuman desde el avance", ["GES-15", "100-T07", "100-T08"], 3, "Highest", "S2", "",
  ["/salud responde 200 en la URL pública", "OpenAPI lista cada endpoint con su permiso", "Base de datos aplicada en Supabase"])
h("HU-100-3", "100", "usuario del sistema", "recibir avisos con la app cerrada", "enterarme a tiempo de lo que me toca",
  ["100-T10", "121-T05", "122-T04"], 5, "Medium", "S5", "A12, I12",
  ["Un evento con push llega una sola vez a Android y a iPhone", "El push nunca lleva datos clínicos"])
h("HU-100-4", "100", "paciente", "que nadie pueda buscar pacientes de forma masiva", "proteger mis datos", ["100-T09"], 1, "Low", "BL", "",
  ["La búsqueda 21 en un minuto devuelve 429 y queda auditada"])

# Épica 101 Identidad
h("HU-101-1", "101", "miembro del personal o paciente", "iniciar sesión con mi rol en mi plataforma y registrarme si soy paciente",
  "ver solo lo que me corresponde", ["101-T03", "101-T04", "101-T06"], 5, "Highest", "S2", "W01, A01, A02, I01, I02",
  ["Cada rol entra en su plataforma", "Un rol en plataforma ajena ve 'Tu rol no usa esta aplicación'", "El paciente se registra en Android e iOS"])
h("HU-101-2", "101", "administrador", "invitar personal, asignar roles y desactivar cuentas", "controlar quién entra sin poder darme permisos a mí mismo",
  ["101-T05"], 3, "High", "S2", "W02, W05, W06",
  ["No puedo asignarme roles", "No se puede quitar el último administrador", "Cuenta desactivada recibe 401"])
h("HU-101-3", "101", "paciente", "vincular mi cuenta con mi expediente y que recepción la verifique", "ver mis citas, fila y resultados",
  ["101-T07"], 5, "High", "S3", "A03, I03, W27, A33",
  ["Sin verificar no veo datos privados", "Al aprobar, mi app cambia sin recargar"])
h("HU-101-4", "101", "médico", "ver la vigencia de mi inscripción en el perfil", "renovarla a tiempo", ["101-T08"], 1, "Low", "BL", "A12, I12",
  ["El perfil muestra la fecha de vencimiento"])

# Épica 102 Pacientes
h("HU-102-1", "102", "recepcionista", "buscar a un paciente antes de registrarlo y registrarlo si no existe, en web y en Android",
  "no crear expedientes duplicados", ["102-T02", "102-T03", "102-T05"], 3, "Highest", "S2", "W26, A30",
  ["'hernandes basquez' encuentra a Hernández Vásquez", "DUI repetido se rechaza con el expediente existente", "Corregir deja historial"])
h("HU-102-2", "102", "paciente", "que cada rol vea de mí solo los datos que necesita", "proteger mi información personal",
  ["102-T04", "110-T01"], 5, "High", "S3", "W26, A30",
  ["Laboratorio no ve mi DUI ni mi teléfono", "Toda lectura queda auditada"])
h("HU-102-3", "102", "paramédico", "registrar a un paciente sin identidad", "atenderlo sin inventar datos", ["102-T06"], 2, "High", "S4", "A73",
  ["Se crea NN con edad estimada y sin fecha exacta"])
h("HU-102-4", "102", "recepcionista", "revisar casos de posible duplicado", "corregir sin fusionar a ciegas", ["102-T07"], 2, "Low", "BL", "W26",
  ["Un registro parecido abre caso y no fusiona"])

# Épica 103 Personal y turnos
h("HU-103-1", "103", "administrador", "registrar al personal de salud con tipo, especialidad y área", "saber quién puede atender",
  ["103-T02", "103-T04"], 3, "Highest", "S2", "W07, W08",
  ["CRUD de personal desde la web", "Personal sin cuenta (motorista, limpieza) también se registra"])
h("HU-103-2", "103", "jefe de operaciones", "crear y mover turnos sin traslapes ni descansos insuficientes, y publicarlos con revisión de cobertura",
  "que los horarios sean posibles y nunca falte personal en emergencia", ["103-T03", "103-T06"], 5, "High", "S2", "W16, W17",
  ["Turno traslapado se rechaza aunque dos jefes lo creen a la vez", "Menos de 8 h de descanso se rechaza", "Huecos de cobertura se advierten al publicar"])
h("HU-103-3", "103", "personal de salud", "ver mis turnos en el teléfono y el planificador semanal en la web",
  "saber cuándo me toca sin preguntar", ["103-T07"], 3, "High", "S3", "W16, A26, I26",
  ["Un cambio de turno llega al teléfono sin recargar"])
h("HU-103-4", "103", "visitante", "ver qué médicos están de turno", "saber quién atiende hoy", ["103-T08"], 1, "High", "S3", "W34, A10, I10",
  ["Solo nombre, especialidad y área"])
h("HU-103-5", "103", "jefe de operaciones", "registrar la inscripción profesional y que no se programe ni firme quien la tiene vencida",
  "cumplir la ley de la JVPM", ["103-T05"], 2, "High", "S2", "W08, W17",
  ["Médico con inscripción vencida no se programa", "La firma de consulta y de alta usa esta vigencia"])
h("HU-103-6", "103", "jefe de operaciones", "un aviso cuando alguien pasa de 44 horas semanales", "no agotar al personal",
  ["103-T09"], 1, "Low", "BL", "W17", ["Pasar de 44 h pide justificación y se guarda"])

# Épica 104 Edificio y camas
h("HU-104-1", "104", "administrador", "configurar el edificio como árbol de plantas, habitaciones y camas",
  "que las capacidades sean datos y no código", ["104-T02", "104-T04"], 3, "High", "S2", "W09",
  ["17 camas: 12 semiprivadas y 5 VIP", "No se agrega una tercera cama a una semiprivada", "Conteos por planta con consulta recursiva"])
h("HU-104-2", "104", "recepcionista o jefe de operaciones", "ver el estado de cada cama en vivo por planta", "asignar sin llamar a la planta",
  ["104-T03", "104-T05"], 5, "High", "S3", "W12, A35",
  ["El plano cambia sin recargar", "Ocupante en iniciales para quien no tiene permiso"])
h("HU-104-3", "104", "enfermería", "registrar limpieza y que otra persona la verifique para liberar la cama", "no asignar camas sucias",
  ["104-T06"], 3, "High", "S4", "A52",
  ["Quien limpió no puede verificar", "Al verificar, la cama queda libre en todos los tableros"])
h("HU-104-4", "104", "jefe de operaciones", "saber qué equipo médico hay y si funciona", "planificar mantenimiento", ["104-T07"], 2, "Low", "BL", "W24",
  ["Un monitor en mantenimiento se ve en su habitación"])

# Épica 105 Fila y citas
h("HU-105-1", "105", "paciente", "recibir mi número de fila y ver en vivo cuándo me llaman", "no estar pendiente del mostrador",
  ["105-T02", "105-T03"], 5, "High", "S3", "W29, A31, A40, A05, I05",
  ["50 números simultáneos sin repetidos", "Mi teléfono avisa al ser llamado"])
h("HU-105-2", "105", "recepcionista", "agendar citas sin traslapes con la disponibilidad del médico", "ordenar la consulta", ["105-T04"], 3, "High", "S3", "W28, A32",
  ["Dos citas del mismo médico a la misma hora: solo una queda"])
h("HU-105-3", "105", "paciente", "pedir una cita desde la app", "no tener que ir al hospital a pedirla", ["105-T05"], 3, "High", "S4", "A06, I06, W28",
  ["Queda solicitada hasta que recepción confirma", "La confirmación me llega en vivo"])
h("HU-105-4", "105", "visitante en sala de espera", "ver los números llamados en la pantalla pública", "saber cuándo pasar", ["105-T06"], 2, "Low", "BL", "W34",
  ["Sin nombres", "Tres llamados sin presentarse cambian el estado"])

# Épica 106 Consulta
h("HU-106-1", "106", "médico", "registrar signos, diagnóstico CIE-10, receta y órdenes de laboratorio en una consulta",
  "atender completo desde el móvil", ["106-T02", "106-T05"], 8, "High", "S3", "A20, A21, A41, I20, I21",
  ["Diagnóstico con buscador CIE-10", "La orden aparece en la cola del laboratorio"])
h("HU-106-2", "106", "médico", "firmar la consulta con mi inscripción vigente", "que el expediente sea confiable", ["106-T03"], 2, "High", "S3", "A21, I21",
  ["Inscripción vencida no firma", "Lo firmado no se edita"])
h("HU-106-3", "106", "médico o paciente", "ver el historial clínico", "dar continuidad a la atención", ["106-T04"], 3, "High", "S3", "A22, I22, A08, I08",
  ["El paciente ve sus consultas firmadas", "Cada lectura queda auditada"])
h("HU-106-4", "106", "médico", "indicar hospitalización desde la consulta", "que admisión lo reciba sin papel", ["106-T06"], 1, "High", "S4", "A24, I24",
  ["La indicación aparece en admisiones con origen consulta"])
h("HU-106-5", "106", "médico", "corregir una consulta firmada con addendum", "no perder el original", ["106-T07"], 2, "Low", "BL", "A21, I21",
  ["El historial muestra original y addendum"])

# Épica 107 Laboratorio
h("HU-107-1", "107", "laboratorista", "recibir órdenes con paneles expandidos y procesarlas de Pendiente a En Proceso y Completado con valores y rangos",
  "entregar resultados ordenados", ["107-T02", "107-T03", "107-T04"], 8, "High", "S3", "W20, W21, A60, A61, A62",
  ["Transición inválida se rechaza", "Valor fuera de rango se marca alto o bajo", "La cola se actualiza sola"])
h("HU-107-2", "107", "médico y paciente", "que el médico revise el resultado antes de que el paciente vea los valores",
  "evitar malas interpretaciones", ["107-T05"], 3, "High", "S4", "A23, I23, A07, I07",
  ["El paciente ve el estado siempre y los valores solo tras la revisión"])
h("HU-107-3", "107", "médico", "recibir aviso inmediato de un valor crítico", "actuar a tiempo", ["107-T06"], 3, "Medium", "S5", "A23, I23",
  ["El aviso llega aunque la app esté cerrada"])
h("HU-107-4", "107", "laboratorista", "corregir un valor conservando el anterior", "no ocultar errores", ["107-T07"], 1, "Low", "BL", "W21",
  ["El valor anterior queda visible para el médico"])

# Épica 108 Admisión y hospitalización
h("HU-108-1", "108", "recepcionista", "admitir con origen y recibir camas sugeridas con su motivo",
  "elegir bien la cama", ["108-T02", "108-T03"], 5, "High", "S4", "W13, W14, A34",
  ["Sugerencia prioriza habitación con ocupante compatible", "Una segunda admisión activa del mismo paciente se rechaza"])
h("HU-108-2", "108", "recepcionista", "asignar la cama aunque otra persona esté asignando al mismo tiempo",
  "que nunca haya doble asignación", ["108-T04", "108-T07"], 8, "High", "S4", "W14, A34, W12",
  ["La última cama solo la toma una persona y la otra ve la siguiente sugerencia", "El aislamiento bloquea la segunda cama"])
h("HU-108-3", "108", "jefe de operaciones", "trasladar pacientes respetando la regla VIP", "mover camas sin errores", ["108-T05"], 2, "High", "S4", "W15",
  ["VIP no se traslada", "La cama anterior queda en limpieza"])
h("HU-108-4", "108", "médico o enfermería", "ver a mis hospitalizados y firmar el alta", "cerrar la estancia con todo pendiente asignado",
  ["108-T06", "108-T08"], 5, "High", "S4", "A24, I24, A50",
  ["Alta exige responsable por pendiente", "Salida física deja la cama en limpieza"])
h("HU-108-5", "108", "recepcionista", "reservar cama para una admisión programada", "tener la cama lista", ["108-T09"], 2, "Low", "BL", "W14",
  ["La reserva vence sola"])
h("HU-108-6", "108", "enfermería", "registrar notas y signos del hospitalizado", "dejar constancia del cuidado", ["108-T10"], 2, "Low", "BL", "A51",
  ["El médico ve lo registrado"])

# Épica 109 Ambulancia
h("HU-109-1", "109", "despacho y tripulación", "ver el estado de la única ambulancia en vivo", "saber si se puede despachar",
  ["109-T02"], 2, "High", "S2", "W18, A70",
  ["Sin paramédico de turno no puede estar Disponible", "El estado cambia en todas las pantallas"])
h("HU-109-2", "109", "despacho", "confirmar solicitudes y despachar la única ambulancia", "que nunca se despache dos veces",
  ["109-T03"], 5, "High", "S4", "W18, A36",
  ["Dos despachos a la vez: uno gana", "La solicitud del paciente queda por confirmar hasta la llamada"])
h("HU-109-3", "109", "tripulación", "registrar los hitos del servicio y terminarlo", "que todos sepan dónde va la ambulancia",
  ["109-T04", "109-T05"], 8, "High", "S4", "W18, A71",
  ["Hitos en orden", "Al finalizar vuelve a Disponible", "Mantenimiento solo sin servicio activo"])
h("HU-109-4", "109", "paciente", "pedir ambulancia y seguirla en vivo", "saber cuándo llega", ["109-T06"], 2, "High", "S4", "A09, I09",
  ["Veo confirmada, en camino y llegó sin recargar", "La app muestra el aviso del 911"])
h("HU-109-5", "109", "jefe de operaciones", "consultar la bitácora filtrada", "evaluar el servicio sin ver datos privados", ["109-T07"], 3, "High", "S4", "W19, A74",
  ["Sin relación de atención no veo el nombre del paciente"])
h("HU-109-6", "109", "recepcionista", "crear la admisión de quien llega en ambulancia", "no repetir datos", ["109-T08"], 1, "High", "S4", "W14",
  ["La admisión guarda el servicio de origen"])
h("HU-109-7", "109", "paramédico", "enviar el reporte del paciente antes de llegar, aunque no tenga señal", "que emergencia se prepare",
  ["109-T09", "121-T04"], 5, "Medium", "S5", "A72, A54, A25, I25",
  ["En modo avión se encola y se envía una sola vez", "Emergencia lo recibe en vivo"])
h("HU-109-8", "109", "despacho", "ver la ubicación de la ambulancia en un mapa", "estimar la llegada", ["109-T10"], 3, "Low", "BL", "W18",
  ["El punto se mueve en el mapa"])

# Épica 110 Privacidad
h("HU-110-1", "110", "paciente", "que mis datos clínicos solo los vea quien me atiende", "confiar en el hospital", ["110-T02"], 3, "High", "S3", "A22, I22",
  ["Médico no tratante recibe 'sin acceso' y queda auditado"])
h("HU-110-2", "110", "delegado de protección de datos", "aprobar accesos excepcionales que vencen solos", "que la administración vea lo clínico solo con motivo",
  ["110-T03", "110-T05"], 5, "High", "S4", "W30, W31",
  ["El acceso vence solo", "Nadie aprueba su propio acceso"])
h("HU-110-3", "110", "delegado de protección de datos", "consultar la auditoría y verificar su integridad", "detectar alteraciones", ["110-T04"], 3, "High", "S3", "W32",
  ["Un registro alterado se detecta desde la web"])
h("HU-110-4", "110", "paciente", "ver quién consultó mi expediente", "ejercer mi derecho a saberlo", ["110-T07"], 2, "Low", "BL", "A11, I11",
  ["Veo fecha, rol y motivo"])
h("HU-110-5", "110", "médico de emergencia", "abrir acceso inmediato en una urgencia", "atender sin esperar aprobación", ["110-T08"], 2, "Low", "BL", "A22",
  ["El acceso queda pendiente de revisión del delegado"])

# Épica 111 Inventario
h("HU-111-1", "111", "jefe de operaciones", "controlar insumos y reactivos por lote con alerta de mínimo", "no quedarme sin material",
  ["111-T02", "111-T03"], 3, "High", "S3", "W22, W23",
  ["Nunca hay existencias negativas, ni con salidas simultáneas", "La alerta aparece en vivo"])
h("HU-111-2", "111", "enfermería", "registrar el consumo de insumos desde el teléfono", "que el inventario sea real", ["111-T04"], 2, "Low", "BL", "A53",
  ["El consumo baja la existencia"])

# Épica 112 Información pública
h("HU-112-1", "112", "visitante", "ver ocupación general, médicos de turno y avisos en una pantalla pública y en las apps",
  "informarme sin datos privados", ["112-T01", "112-T02", "120-T04"], 3, "High", "S3", "W25, W34, A10, I10",
  ["Ninguna respuesta pública contiene datos personales", "El aviso aparece y vence solo"])
h("HU-112-2", "112", "jefe de operaciones", "que me advierta si un aviso tiene datos personales", "no publicarlos por error", ["112-T03"], 1, "Low", "BL", "W25",
  ["Un aviso con un DUI muestra advertencia"])

# Épica 113 Tablero
h("HU-113-1", "113", "administrador o jefe de operaciones", "un tablero inicial con ocupación, personal y pacientes", "ver el día al entrar",
  ["113-T01"], 3, "Highest", "S2", "W03",
  ["El tablero se ve en la web desplegada", "Ninguna tarjeta muestra datos personales"])
h("HU-113-2", "113", "usuario web", "tarjetas en vivo y una bandeja de pendientes por rol", "trabajar sin recargar", ["113-T02", "113-T03"], 3, "High", "S4", "W03, W04",
  ["La ocupación cambia sin recargar", "Todas las tarjetas tienen datos reales"])
h("HU-113-3", "113", "administrador", "indicadores por rango de fechas", "evaluar tendencias", ["113-T04"], 3, "Low", "BL", "W33",
  ["Cinco indicadores con valores esperados"])

# Épica 114 Avisos
h("HU-114-1", "114", "usuario de cualquier plataforma", "avisos urgentes en franja y de atención en la campana, y aviso de sesión por vencer",
  "enterarme de lo importante sin ruido", ["114-T01", "114-T02"], 5, "High", "S3", "W36 y estados comunes",
  ["La solicitud de ambulancia aparece en franja con Abrir", "Bajo mínimo suma a la campana sin sonido", "Cuenta regresiva antes de cerrar sesión"])
h("HU-114-2", "114", "médico", "que un aviso crítico ocupe la pantalla y suene hasta que alguien confirme", "no perder un valor crítico",
  ["114-T03"], 5, "Medium", "S5", "Avisos críticos",
  ["Confirmar pausa 2 minutos", "Si nadie confirma en 5 minutos, escala"])

# Épicas de clientes (120 a 122)
h("HU-120-1", "120", "usuario web", "un panel React con menú por rol, estados comunes y cliente de API", "trabajar en la web desde el avance",
  ["120-T01", "120-T02"], 5, "Highest", "S2", "W01, W03, W35, W36",
  ["El laboratorista ve solo su menú", "La web está desplegada"])
h("HU-120-2", "120", "usuario web", "que la web se actualice sola y se recupere al perder la red", "no recargar nunca", ["120-T03"], 3, "High", "S2", "W36",
  ["Tras perder la red, el tablero se corrige solo"])
h("HU-120-3", "120", "evaluador", "una web accesible, con cierre por inactividad y pruebas de punta a punta de la defensa", "confiar en la demostración",
  ["120-T05"], 3, "High", "S5", "W36",
  ["Revisión de contraste sin errores", "Flujos de la defensa automatizados"])
h("HU-121-1", "121", "usuario Android", "una app Kotlin con Compose, ingreso y navegación por rol para los 7 roles",
  "usar el sistema en el punto de atención desde el avance", ["121-T01", "121-T02"], 8, "Highest", "S2", "A01 a A74 (navegación)",
  ["Navegación de los 7 roles de Android", "Girar el teléfono no pierde lo escrito"])
h("HU-121-2", "121", "usuario Android", "que la app se actualice sola con eventos en vivo", "no recargar", ["121-T03"], 3, "High", "S2", "A35",
  ["Un cambio de cama en web aparece en Android sin recargar"])
h("HU-121-3", "121", "evaluador", "pruebas de los ViewModels y de la interfaz de ingreso", "ver la calidad del código Android", ["121-T06"], 3, "High", "S5", "",
  ["./gradlew test pasa"])
h("HU-122-1", "122", "médico o paciente con iPhone", "una app SwiftUI con ingreso y pestañas por rol", "usar el sistema desde iOS en el avance",
  ["122-T01", "122-T02"], 5, "Highest", "S2", "I01 a I26 (navegación)",
  ["Pestañas correctas para médico y paciente", "Un rol sin iOS ve el aviso y sale"])
h("HU-122-2", "122", "usuario iOS", "que la app se actualice sola con eventos en vivo", "no recargar", ["122-T03"], 2, "High", "S2", "I05",
  ["El número de fila cambia en vivo al ser llamado"])
h("HU-122-3", "122", "evaluador", "pruebas de los view models y sesión guardada en Keychain", "ver la calidad del código iOS", ["122-T05"], 2, "High", "S5", "",
  ["Las pruebas pasan en la Mac universitaria"])

# Épica 130 Calidad
h("HU-130-1", "130", "equipo", "pruebas contra PostgreSQL real e integración continua en GitHub", "no romper lo que ya funciona",
  ["130-T01", "130-T02", "130-T03"], 3, "High", "S3", "",
  ["Cada PR muestra el estado de compilación y pruebas", "Una prueba concurrente corre en CI"])
h("HU-130-2", "130", "docente evaluador", "ver en vivo que dos personas no pueden tomar la misma cama ni despachar dos veces la ambulancia",
  "comprobar la concurrencia", ["130-T04", "130-T05"], 5, "High", "S5", "",
  ["Las siete pruebas pasan 20 veces seguidas", "El script de demostración corre contra la API desplegada"])

# Fuera del curso (nivel F, diseñado): épicas sin sprint
FUTURO = [
    ("F-006", "Cuenta del paciente, caja y cobros", "W40, W41, W42, W43, W44, W45, A13, I13", "F13",
     "Como facturación, quiero que los cargos entren solos a la cuenta del episodio y se dividan por pagador, para cobrar sin errores.", 13),
    ("F-007", "Documentos tributarios electrónicos (DTE)", "W46", "F13",
     "Como facturación, quiero emitir facturas y créditos fiscales electrónicos con su sello de Hacienda, para cumplir con el MH.", 13),
    ("F-009", "Aseguradoras, reclamos y glosas", "W47, W56", "F14",
     "Como facturación, quiero seguir cada reclamo desde la garantía hasta la remesa, para cobrar lo que corresponde a la aseguradora.", 13),
    ("F-008", "Tarifas, honorarios médicos y F-958", "W48, W49, W54", "F16",
     "Como contadora, quiero liquidar honorarios con su retención y armar el F-958 desde los procedimientos, para no buscar papeles.", 8),
    ("F-R22", "Contabilidad general de la contadora", "W50, W51, W52, W53, W55, W57", "F15",
     "Como contadora, quiero recorrer el cierre del mes de cada cliente con validaciones cruzadas, para presentar sin errores.", 13),
]

# Orden de trabajo dentro de cada sprint (igual al rango del tablero de Jira)
ORDEN = {
    "S1": ["HU-131-00", "HU-100-0", "HU-131-0"],
    "S2": ["HU-100-1", "HU-100-2", "HU-101-1", "HU-120-1", "HU-121-1", "HU-122-1", "HU-102-1", "HU-103-1", "HU-113-1",
           "HU-131-1", "HU-131-2", "HU-131-3", "HU-131-4", "HU-101-2", "HU-103-2", "HU-103-5", "HU-104-1", "HU-109-1",
           "HU-120-2", "HU-121-2", "HU-122-2"],
    "S3": ["HU-101-3", "HU-102-2", "HU-103-3", "HU-103-4", "HU-104-2", "HU-105-1", "HU-105-2", "HU-106-1", "HU-106-2",
           "HU-106-3", "HU-107-1", "HU-110-1", "HU-110-3", "HU-111-1", "HU-112-1", "HU-114-1", "HU-130-1"],
    "S4": ["HU-108-1", "HU-108-2", "HU-108-3", "HU-108-4", "HU-104-3", "HU-106-4", "HU-109-2", "HU-109-3", "HU-109-4",
           "HU-109-5", "HU-109-6", "HU-102-3", "HU-110-2", "HU-107-2", "HU-105-3", "HU-113-2"],
    "S5": ["HU-130-2", "HU-120-3", "HU-121-3", "HU-122-3", "HU-131-5", "HU-100-3", "HU-107-3", "HU-109-7", "HU-114-2"],
    "BL": ["HU-100-4", "HU-101-4", "HU-102-4", "HU-103-6", "HU-104-4", "HU-105-4", "HU-106-5", "HU-107-4", "HU-108-5",
           "HU-108-6", "HU-109-8", "HU-110-4", "HU-110-5", "HU-111-2", "HU-112-2", "HU-113-3"],
}
