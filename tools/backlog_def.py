"""Definición del backlog para Jira: equipo, reparto por área, puntos, historias de usuario y trabajo de diseño y QA.

Fuente de verdad del QUÉ: specs/*/tasks.md. Este archivo agrega el QUIÉN, el CUÁNTO y la historia de usuario.
"""

EQUIPO = {
    "CAR": ("Carlos", "Scrum Master · Backend y base de datos · supervisión general"),
    "LEO": ("Leonel", "Desarrollador principal 2 · Frontend web y base de front · supervisión general"),
    "FER": ("Fernando", "Desarrollador principal Android"),
    "MIL": ("Milton", "Desarrollador principal iOS"),
    "WAL": ("Walter", "QA y pruebas · diseño de prototipos · documentación"),
    "ANG": ("Ángel", "QA y pruebas · diseño de prototipos · documentación"),
}

# Responsable y revisor por área de trabajo
AREAS = {
    "BE": ("Backend y base de datos", "CAR", "LEO"),
    "WEB": ("Web", "LEO", "CAR"),
    "AND": ("Android", "FER", "LEO"),
    "IOS": ("iOS", "MIL", "LEO"),
    "DOC": ("Documentación", "CAR", "LEO"),
    "DIS": ("Diseño", None, "LEO"),   # responsable por tarea
    "QA": ("Calidad", None, "CAR"),   # responsable por spec
}

# Backend que toma Leonel para equilibrar carga (Carlos conserva plataforma, acceso, pacientes, edificio,
# consulta, hospitalización, ambulancia y privacidad). En estas épicas Carlos revisa el backend.
BE_POR_SPEC = {"103": "LEO", "105": "LEO", "107": "LEO", "111": "LEO", "112": "LEO", "113": "LEO"}

# QA alterna por épica para repartir carga entre Walter y Ángel
QA_POR_SPEC = {
    "100": "WAL", "101": "ANG", "102": "WAL", "103": "ANG", "104": "WAL", "105": "ANG", "106": "WAL",
    "107": "ANG", "108": "WAL", "109": "ANG", "110": "WAL", "111": "ANG", "112": "WAL", "113": "ANG",
    "120": "WAL", "121": "ANG", "122": "WAL", "130": "ANG", "131": "ANG",
}

# Tarea de spec -> lista de (área, puntos). Varias áreas = una subtarea por área.
TAREAS = {
    "100-T01": [("BE", 3)], "100-T02": [("BE", 5)], "100-T03": [("BE", 3)], "100-T04": [("BE", 3)],
    "100-T05": [("BE", 3)], "100-T06": [("BE", 2)], "100-T07": [("BE", 2)], "100-T08": [("BE", 3)],
    "100-T09": [("BE", 2)], "100-T10": [("BE", 5)],
    "101-T01": [("BE", 2)], "101-T02": [("BE", 1)], "101-T03": [("BE", 2)], "101-T04": [("BE", 2)],
    "101-T05": [("BE", 5)], "101-T06": [("WEB", 3), ("AND", 3), ("IOS", 3)],
    "101-T07": [("BE", 3), ("WEB", 2), ("AND", 2), ("IOS", 2)], "101-T08": [("BE", 1), ("AND", 1), ("IOS", 1)],
    "102-T01": [("BE", 2)], "102-T02": [("BE", 5)], "102-T03": [("BE", 5)], "102-T04": [("BE", 3)],
    "102-T05": [("WEB", 3), ("AND", 3)], "102-T06": [("AND", 3)], "102-T07": [("BE", 3)],
    "103-T01": [("BE", 2)], "103-T02": [("BE", 3)], "103-T03": [("BE", 5)], "103-T04": [("WEB", 3)],
    "103-T05": [("BE", 2)], "103-T06": [("BE", 5)], "103-T07": [("WEB", 5), ("AND", 2), ("IOS", 2)],
    "103-T08": [("BE", 1)], "103-T09": [("BE", 2), ("WEB", 1)],
    "104-T01": [("BE", 2)], "104-T02": [("BE", 3)], "104-T03": [("BE", 3)], "104-T04": [("BE", 2)],
    "104-T05": [("WEB", 5)], "104-T06": [("BE", 3), ("AND", 3)], "104-T07": [("BE", 2), ("WEB", 2)],
    "105-T01": [("BE", 2)], "105-T02": [("BE", 3)], "105-T03": [("AND", 3), ("IOS", 3)],
    "105-T04": [("BE", 3), ("WEB", 3), ("AND", 3)], "105-T05": [("BE", 2), ("WEB", 2), ("AND", 2), ("IOS", 2)],
    "105-T06": [("BE", 1), ("WEB", 2)],
    "106-T01": [("BE", 2)], "106-T02": [("BE", 5)], "106-T03": [("BE", 3)], "106-T04": [("BE", 3), ("AND", 2), ("IOS", 2)],
    "106-T05": [("AND", 5), ("IOS", 5)], "106-T06": [("BE", 2), ("AND", 1), ("IOS", 1)], "106-T07": [("BE", 2), ("AND", 1), ("IOS", 1)],
    "107-T01": [("BE", 2)], "107-T02": [("BE", 3)], "107-T03": [("BE", 5)], "107-T04": [("WEB", 5), ("AND", 5)],
    "107-T05": [("BE", 2), ("AND", 3), ("IOS", 3)], "107-T06": [("BE", 2), ("AND", 1), ("IOS", 1)], "107-T07": [("BE", 2)],
    "108-T01": [("BE", 2)], "108-T02": [("BE", 2)], "108-T03": [("BE", 5)], "108-T04": [("BE", 5)], "108-T05": [("BE", 3)],
    "108-T06": [("BE", 3)], "108-T07": [("WEB", 5), ("AND", 5)], "108-T08": [("BE", 2), ("AND", 3), ("IOS", 2)],
    "108-T09": [("BE", 3)], "108-T10": [("BE", 2), ("AND", 2)],
    "109-T01": [("BE", 2)], "109-T02": [("BE", 3)], "109-T03": [("BE", 5)], "109-T04": [("BE", 3)],
    "109-T05": [("WEB", 5), ("AND", 5)], "109-T06": [("AND", 2), ("IOS", 2)], "109-T07": [("BE", 2), ("WEB", 3), ("AND", 1)],
    "109-T08": [("BE", 2)], "109-T09": [("BE", 3), ("AND", 5)], "109-T10": [("BE", 2), ("WEB", 3), ("AND", 2)],
    "110-T01": [("BE", 5)], "110-T02": [("BE", 3)], "110-T03": [("BE", 3)], "110-T04": [("BE", 2), ("WEB", 3)],
    "110-T05": [("WEB", 3), ("AND", 2), ("IOS", 2)], "110-T06": [("DOC", 1)], "110-T07": [("BE", 1), ("AND", 1), ("IOS", 1)],
    "110-T08": [("BE", 2), ("AND", 1), ("IOS", 1)],
    "111-T01": [("BE", 1)], "111-T02": [("BE", 3)], "111-T03": [("BE", 1), ("WEB", 3)], "111-T04": [("AND", 2)],
    "112-T01": [("BE", 2)], "112-T02": [("BE", 1), ("WEB", 3), ("AND", 1), ("IOS", 1)], "112-T03": [("WEB", 1)],
    "113-T01": [("BE", 2), ("WEB", 3)], "113-T02": [("BE", 2), ("WEB", 3)], "113-T03": [("BE", 2), ("WEB", 2)],
    "113-T04": [("BE", 3), ("WEB", 3)],
    "120-T01": [("WEB", 3)], "120-T02": [("WEB", 5)], "120-T03": [("WEB", 3)], "120-T04": [("WEB", 2)],
    "120-T05": [("WEB", 3), ("QA", 3)],
    "121-T01": [("AND", 3)], "121-T02": [("AND", 8)], "121-T03": [("AND", 3)], "121-T04": [("AND", 5)],
    "121-T05": [("AND", 2)], "121-T06": [("AND", 3)],
    "122-T01": [("IOS", 3)], "122-T02": [("IOS", 8)], "122-T03": [("IOS", 3)], "122-T04": [("IOS", 2)], "122-T05": [("IOS", 3)],
    "130-T01": [("BE", 2)], "130-T02": [("WEB", 3)], "130-T03": [("BE", 2)], "130-T04": [("BE", 5)], "130-T05": [("BE", 2)],
    "130-T06": [("QA", 3)],
    "131-T01": [("DOC", 2)], "131-T02": [("WEB", 2), ("AND", 1), ("IOS", 1)], "131-T03": [("DIS", 1, "WAL")],
    "131-T04": [("BE", 2)], "131-T05": [("QA", 3)], "131-T06": [("DOC", 3), ("QA", 2)],
}

# Trabajo que no está en las specs de código: diseño (avance del 31 de oct) y gestión
EXTRA = [
    # id, épica, semana, nivel, área, responsable, puntos, título, hecho cuando
    ("DIS-01", "131", "S1", "R", "DIS", "CAR", 3, "Base del sistema de diseño en Claude Design (tokens, tipografía, componentes)",
     "Tokens claro y oscuro, escala tipográfica y componentes de docs/diseno/brief-claude-design.md exportados a Figma"),
    ("DIS-02", "131", "S1", "R", "DIS", "WAL", 3, "Biblioteca de componentes en Figma con todos sus estados",
     "Cada componente de la sección 6 del brief tiene normal, foco, deshabilitado, cargando y error"),
    ("DIS-03", "131", "S1", "R", "DIS", "WAL", 5, "Prototipo web: ingreso, tablero, usuarios, personal, edificio, catálogo (W01 a W12)",
     "Pantallas en Figma con estados comunes, revisadas por Leonel"),
    ("DIS-04", "131", "S2", "R", "DIS", "WAL", 5, "Prototipo web: admisiones, camas, turnos, ambulancia, laboratorio, inventario, avisos (W13 a W25)",
     "Pantallas en Figma revisadas por Leonel"),
    ("DIS-05", "131", "S2", "R", "DIS", "WAL", 3, "Prototipo web: recepción, delegado, métricas, pantalla pública (W26 a W36)",
     "Pantallas en Figma revisadas por Leonel"),
    ("DIS-06", "131", "S1", "R", "DIS", "ANG", 3, "Prototipo Android: ingreso, registro y app del paciente (A01 a A12)",
     "Pantallas en Figma en Material 3 revisadas por Fernando"),
    ("DIS-07", "131", "S1", "R", "DIS", "ANG", 3, "Prototipo Android: médico (A20 a A26)", "Revisadas por Fernando"),
    ("DIS-08", "131", "S2", "R", "DIS", "ANG", 3, "Prototipo Android: recepción y asistente (A30 a A41)", "Revisadas por Fernando"),
    ("DIS-09", "131", "S2", "R", "DIS", "ANG", 3, "Prototipo Android: enfermería, laboratorio y paramédico (A50 a A74)", "Revisadas por Fernando"),
    ("DIS-10", "131", "S2", "R", "DIS", "WAL", 5, "Prototipo iOS: paciente y médico (I01 a I26)", "Pantallas según guías de Apple revisadas por Milton"),
    ("DIS-11", "131", "S2", "R", "DIS", "ANG", 3, "Flujos F01 a F12 enlazados como prototipo interactivo",
     "Cada flujo del inventario navega de punta a punta en Figma"),
    ("DIS-12", "131", "S2", "R", "QA", "WAL", 2, "Revisión de accesibilidad del diseño (contraste, tamaños, estados sin color)",
     "Lista de verificación firmada; ningún estado depende solo del color"),
    ("GES-01", "131", "S1", "R", "DOC", "CAR", 2, "Configurar Jira: épicas, historias, tablero y sprints desde el backlog",
     "El tablero tiene los 5 sprints con las historias de este documento"),
    ("GES-02", "131", "S1", "R", "QA", "ANG", 2, "Plantilla de casos de prueba y de reporte de defectos",
     "Plantilla aprobada por Carlos y usada en el primer caso"),
    ("GES-03", "131", "S1", "R", "QA", "WAL", 2, "Datos ficticios de prueba por rol (usuarios, pacientes, escenarios)",
     "Hoja con un usuario por rol y 10 pacientes ficticios cargados en el entorno de pruebas"),
]

# Plantillas de QA por épica de dominio (101 a 113): casos de prueba y prueba manual
QA_EPICAS = ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "111", "112", "113"]

# Historias de usuario: épica -> lista de (id, como, quiero, para, tareas, criterios)
HISTORIAS = {
    "100": [
        ("HU-100-1", "equipo de desarrollo", "una API base con seguridad, auditoría e idempotencia",
         "que cada módulo nazca protegido y trazable", ["100-T01", "100-T02", "100-T03", "100-T04", "100-T05", "100-T06"],
         ["Token inválido responde 401", "Sin permiso responde 403 y se audita", "Doble clic no duplica efectos"]),
        ("HU-100-2", "equipo", "la API publicada en la nube con su contrato OpenAPI",
         "que las tres apps la consuman desde el día uno", ["100-T07", "100-T08"],
         ["/salud responde 200 en la URL pública", "OpenAPI lista cada endpoint con su permiso"]),
        ("HU-100-3", "usuario del sistema", "recibir avisos aunque la app esté cerrada y que no abusen de las búsquedas",
         "enterarme a tiempo y proteger los datos", ["100-T09", "100-T10"],
         ["Un evento con push llega una sola vez", "La búsqueda 21 en un minuto devuelve 429"]),
    ],
    "101": [
        ("HU-101-1", "miembro del personal", "iniciar sesión con mi rol en mi plataforma",
         "ver solo lo que me corresponde", ["101-T01", "101-T02", "101-T03", "101-T04", "101-T06"],
         ["Cada rol entra en su plataforma", "Un rol en plataforma ajena ve 'Tu rol no usa esta aplicación'"]),
        ("HU-101-2", "administrador", "invitar personal, asignar roles y desactivar cuentas",
         "controlar quién entra sin poder darme permisos a mí mismo", ["101-T05", "101-T08"],
         ["No puedo asignarme roles", "No se puede quitar el último administrador", "Cuenta desactivada recibe 401"]),
        ("HU-101-3", "paciente", "crear mi cuenta y vincularla con mi expediente",
         "ver mis citas, fila y resultados", ["101-T07"],
         ["Sin verificar no veo datos privados", "Al aprobar recepción, mi app cambia sin recargar"]),
    ],
    "102": [
        ("HU-102-1", "recepcionista", "buscar antes de registrar y ver por qué coincide un paciente",
         "no crear expedientes duplicados", ["102-T01", "102-T02", "102-T03", "102-T05", "102-T07"],
         ["'hernandes basquez' encuentra a Hernández Vásquez", "DUI repetido se rechaza con el expediente existente"]),
        ("HU-102-2", "paciente", "que cada rol vea de mí solo los datos que necesita",
         "proteger mi información personal", ["102-T04"],
         ["Laboratorio no ve mi DUI ni mi teléfono", "Toda lectura queda auditada"]),
        ("HU-102-3", "paramédico", "registrar a un paciente sin identidad", "atenderlo sin inventar datos", ["102-T06"],
         ["Se crea NN con edad estimada y sin fecha exacta"]),
    ],
    "103": [
        ("HU-103-1", "administrador", "registrar al personal de salud con su tipo, especialidad e inscripción",
         "saber quién puede atender", ["103-T01", "103-T02", "103-T04", "103-T05"],
         ["CRUD de personal desde la web", "Médico con inscripción vencida no se programa"]),
        ("HU-103-2", "jefe de operaciones", "planificar y publicar turnos sin traslapes y con cobertura",
         "que nunca falte personal en emergencia", ["103-T03", "103-T06", "103-T07", "103-T09"],
         ["Turno traslapado se rechaza aun si dos jefes lo crean a la vez", "Huecos de cobertura se advierten al publicar"]),
        ("HU-103-3", "visitante", "ver qué médicos están de turno", "saber quién atiende hoy", ["103-T08"],
         ["Solo nombre, especialidad y área"]),
    ],
    "104": [
        ("HU-104-1", "administrador", "configurar el edificio como un árbol de plantas, habitaciones y camas",
         "que las capacidades sean datos y no código", ["104-T01", "104-T02", "104-T04", "104-T05"],
         ["17 camas: 12 semiprivadas y 5 VIP", "No se agrega una tercera cama a una semiprivada"]),
        ("HU-104-2", "recepcionista o jefe de operaciones", "ver el estado de cada cama en vivo",
         "asignar sin llamar a la planta", ["104-T03", "104-T06"],
         ["El tablero cambia sin recargar", "Quien limpió no puede verificar su propia limpieza"]),
        ("HU-104-3", "jefe de operaciones", "saber qué equipo médico hay y si funciona", "planificar mantenimiento", ["104-T07"],
         ["Un monitor en mantenimiento se ve en su habitación"]),
    ],
    "105": [
        ("HU-105-1", "paciente", "recibir mi número de fila y ver en vivo cuándo me llaman",
         "no estar pendiente del mostrador", ["105-T01", "105-T02", "105-T03", "105-T06"],
         ["50 números simultáneos sin repetidos", "Mi teléfono vibra al ser llamado"]),
        ("HU-105-2", "recepcionista", "agendar citas sin traslapes", "ordenar la consulta", ["105-T04"],
         ["Dos citas del mismo médico a la misma hora: solo una queda"]),
        ("HU-105-3", "paciente", "pedir una cita desde la app", "no tener que ir al hospital a pedirla", ["105-T05"],
         ["Queda solicitada hasta que recepción confirma", "La confirmación me llega en vivo"]),
    ],
    "106": [
        ("HU-106-1", "médico", "registrar signos, diagnóstico, receta y exámenes en una consulta",
         "atender completo desde el móvil", ["106-T01", "106-T02", "106-T05"],
         ["Diagnóstico con CIE-10", "La orden aparece en la cola del laboratorio"]),
        ("HU-106-2", "médico", "firmar la consulta con mi inscripción vigente y corregir solo con addendum",
         "que el expediente sea confiable", ["106-T03", "106-T07"],
         ["Inscripción vencida no firma", "Lo firmado no se edita"]),
        ("HU-106-3", "médico o paciente", "ver el historial clínico", "dar continuidad a la atención", ["106-T04", "106-T06"],
         ["El paciente ve sus consultas firmadas", "Cada lectura queda auditada"]),
    ],
    "107": [
        ("HU-107-1", "laboratorista", "procesar órdenes de Pendiente a En Proceso y Completado con valores y rangos",
         "entregar resultados ordenados", ["107-T01", "107-T02", "107-T03", "107-T04", "107-T07"],
         ["Transición inválida se rechaza", "Valor fuera de rango se marca alto o bajo"]),
        ("HU-107-2", "médico", "revisar resultados y recibir aviso de valores críticos",
         "actuar a tiempo", ["107-T05", "107-T06"],
         ["Crítico avisa al instante", "El paciente ve valores solo después de mi revisión"]),
    ],
    "108": [
        ("HU-108-1", "recepcionista", "admitir con origen y recibir camas sugeridas con su motivo",
         "asignar bien aunque otra persona esté asignando a la vez", ["108-T01", "108-T02", "108-T03", "108-T04", "108-T07", "108-T09"],
         ["Sugerencia prioriza habitación con ocupante compatible", "La última cama solo la toma una persona"]),
        ("HU-108-2", "jefe de operaciones", "trasladar pacientes respetando la regla VIP", "mover camas sin errores", ["108-T05"],
         ["VIP no se traslada", "La cama anterior queda en limpieza"]),
        ("HU-108-3", "médico o enfermería", "ver a mis hospitalizados, registrar notas y firmar el alta",
         "cerrar la estancia con todo pendiente asignado", ["108-T06", "108-T08", "108-T10"],
         ["Alta exige responsable por pendiente", "Salida física deja la cama en limpieza"]),
    ],
    "109": [
        ("HU-109-1", "despacho", "ver y despachar la única ambulancia en tiempo real",
         "que nunca se despache dos veces", ["109-T01", "109-T02", "109-T03", "109-T04", "109-T05", "109-T08"],
         ["Dos despachos a la vez: uno gana", "Sin paramédico de turno no puede estar Disponible"]),
        ("HU-109-2", "paciente", "pedir ambulancia y seguirla en vivo", "saber cuándo llega", ["109-T06"],
         ["Veo confirmada, en camino y llegó sin recargar", "La app muestra el aviso del 911"]),
        ("HU-109-3", "paramédico", "enviar el reporte del paciente antes de llegar, aunque no tenga señal",
         "que emergencia se prepare", ["109-T09", "109-T10"],
         ["En modo avión se encola y se envía una sola vez", "La ubicación se mueve en el mapa"]),
        ("HU-109-4", "jefe de operaciones", "consultar la bitácora filtrada", "evaluar el servicio sin ver datos privados", ["109-T07"],
         ["Sin relación de atención no veo el nombre del paciente"]),
    ],
    "110": [
        ("HU-110-1", "paciente", "que mis datos clínicos solo los vea quien me atiende",
         "confiar en el hospital", ["110-T01", "110-T02", "110-T06", "110-T07"],
         ["Médico no tratante recibe 'sin acceso'", "Veo quién consultó mi expediente"]),
        ("HU-110-2", "delegado de protección de datos", "aprobar accesos excepcionales y verificar la auditoría",
         "cumplir la política de privacidad", ["110-T03", "110-T04", "110-T05", "110-T08"],
         ["El acceso vence solo", "Detecto un registro de auditoría alterado"]),
    ],
    "111": [
        ("HU-111-1", "jefe de operaciones", "controlar insumos y reactivos por lote con alertas de mínimo",
         "no quedarme sin material", ["111-T01", "111-T02", "111-T03", "111-T04"],
         ["Nunca hay existencias negativas", "La alerta aparece en vivo"]),
    ],
    "112": [
        ("HU-112-1", "visitante", "ver ocupación general, médicos de turno y avisos en una pantalla pública",
         "informarme sin pedir datos privados", ["112-T01", "112-T02", "112-T03"],
         ["Ninguna respuesta pública contiene datos personales", "El aviso aparece y vence solo"]),
    ],
    "113": [
        ("HU-113-1", "administrador o jefe de operaciones", "un tablero en vivo con los indicadores del día",
         "decidir con datos", ["113-T01", "113-T02", "113-T03", "113-T04"],
         ["La ocupación cambia sin recargar", "Ninguna tarjeta muestra datos personales"]),
    ],
    "120": [
        ("HU-120-1", "usuario web", "un panel con menú por rol, datos en vivo y estados claros",
         "trabajar sin recargar la página", ["120-T01", "120-T02", "120-T03", "120-T04", "120-T05"],
         ["El laboratorista ve solo su menú", "Tras perder la red, el tablero se corrige solo"]),
    ],
    "121": [
        ("HU-121-1", "usuario Android", "una app con navegación por rol, MVVM y datos en vivo",
         "trabajar en el punto de atención", ["121-T01", "121-T02", "121-T03", "121-T04", "121-T05", "121-T06"],
         ["Navegación de los 7 roles de Android", "Girar el teléfono no pierde lo escrito"]),
    ],
    "122": [
        ("HU-122-1", "médico o paciente con iPhone", "una app SwiftUI con pestañas por rol y datos en vivo",
         "usar el sistema desde iOS", ["122-T01", "122-T02", "122-T03", "122-T04", "122-T05"],
         ["Pestañas correctas para médico y paciente", "Un rol sin iOS ve el aviso y sale"]),
    ],
    "130": [
        ("HU-130-1", "equipo", "pruebas automáticas, integración continua y demostración de concurrencia",
         "defender la calidad en vivo", ["130-T01", "130-T02", "130-T03", "130-T04", "130-T05", "130-T06"],
         ["Las siete pruebas de concurrencia pasan 20 veces seguidas", "Cada PR muestra el estado de las verificaciones"]),
    ],
    "131": [
        ("HU-131-1", "docente evaluador", "la documentación, el diseño y la defensa completos",
         "evaluar el proyecto con evidencia", ["131-T01", "131-T02", "131-T03", "131-T04", "131-T05", "131-T06"]
         + [e[0] for e in EXTRA],
         ["Figma 100% el 31 de octubre", "PDF de arquitectura con diagramas, RBAC y privacidad", "Defensa ensayada dos veces"]),
    ],
}
