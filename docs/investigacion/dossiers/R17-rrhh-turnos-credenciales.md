# R17. RRHH, turnos, credenciales y planilla

**Versión:** 1 (2026-10-13). **Alimenta:** spec 000 (autorización por privilegio), módulo de personal, turnos y cobertura, honorarios (R16), planilla (exportación a contabilidad).

## 1. Conclusión

V8-02 (HR01-HR03, CRE01-CRE02) y V8-06 (ADM01-ADM02) se conservan: título, competencia y privilegio son cosas distintas; el privilegio se verifica en cada acto y no solo al iniciar sesión; cese bloquea actos nuevos sin borrar autoría. Lo nuevo:

- **Hay dos registros habilitantes, no uno.** La inscripción en la Junta de Vigilancia (CSSP) habilita la profesión. Desde la **Ley de Especialidades de Profesiones Médicas (aprobada en abril de 2024)**, el CONADEM es la única entidad que certifica especialidades y subespecialidades. Según la [prensa de julio de 2025](https://diario.elmundo.sv/politica/conadem-ya-incluyo-5560-medicos-en-un-registro-publico-de-especialistas-donde-consultarlo), la credencial dura un año, hay registro público en conadem.gob.sv y la falta de certificación puede costar hasta US$180,000 y la suspensión. El modelo de credenciales tiene que guardar ambas, con vencimiento.
- **Planilla: el sistema no debe calcularla en la fase 1.** Los porcentajes salen de fuentes secundarias (empleador ISSS 7.5%, AFP 8.75%, 1% formación profesional; salario mínimo comercio y servicios US$408.80 desde 1-jun-2025, según [Revista Summa, agosto 2026](https://revistasumma.com/?p=246626)), cambian por decreto y el contador ya tiene un sistema para eso. El HIS produce **asistencia aprobada, guardias, horas extra autorizadas y honorarios por acto**, y exporta.
- **Jornada:** diurna 8 h y 44 semanales; nocturna (19:00 a 6:00) 7 h y 39 semanales; más de 4 horas nocturnas hacen nocturna la jornada; hora extra con recargo del 100%; asueto trabajado se paga doble; vacaciones 15 días más 30% ([resumen del Código de Trabajo](https://www.jibble.io/es/legislacion-laboral/el-salvador), secundario). Sirven para validar turnos y advertir, no para liquidar.

## 2. Qué se conserva de V1-V9

| Origen | Contenido | Veredicto |
|---|---|---|
| V8 HR01 | Relación laboral con historia; IsActive no reemplaza causal y fecha; honorario, nómina, guardia y comisión no intercambiables | Se conserva |
| V8 HR02 | Turno con inicio, fin, zona, supervisor; presencia distinta de guardia localizada; intercambio con validación de competencia; turno que cruza medianoche no se parte | Se conserva |
| V8 HR03 | Asistencia, planificado, extra autorizada y pagada son estados distintos; biometría no prueba acto clínico; ajuste retroactivo crea ajuste | Se conserva |
| V8 CRE01 | Profesión, junta, tipo de autorización, fuente consultada, fecha, evidencia, revisor; documento cargado no basta | Se conserva; se agrega CONADEM |
| V8 CRE02 | Privilegio con alcance versionado; verificación en el acto; suspensión genera relevo; TI no se autoaprueba | Se conserva |
| V8 ADM01-02 | Planilla como borrador verificable; alertas que no ejecutan despido ni sanción | Se conserva |

## 3. Qué se descarta o corrige

| Afirmación | Corrección |
|---|---|
| "Credencial = número de JVPM" | Incompleto: JVPM o la junta que corresponda para la profesión, más certificación CONADEM para especialidades |
| Calcular planilla dentro del HIS en fase 1 | Diferido; exportar incidencias aprobadas. Revaluar si el contador lo pide |
| Turnos de 24 h como norma | No se asume; la configuración advierte cuando el turno excede jornada legal y exige registro de la excepción pactada |

## 4. Marco legal

| Norma | Regla | Regla del sistema | Estado |
|---|---|---|---|
| Código de Salud y juntas de vigilancia (CSSP: médica, enfermería, laboratorio clínico, químico farmacéutica, odontológica, psicología, veterinaria) | Ejercicio requiere inscripción en la junta | Credencial profesional con junta, número, tipo (permanente, provisional) y vigencia | Heredada; [requisitos JVPM](https://local.cssp.gob.sv/wp-content/uploads/2018/09/CSSP-JVPM-AP-2-2-Requisitos-para-Inscripción-Permanente-Doctorado-en-Medicina-JVPM.pdf) como ejemplo |
| Ley de Especialidades de Profesiones Médicas (2024) | CONADEM certifica especialidades; credencial anual; registro público | Certificación de especialidad con vencimiento; privilegio de especialista bloqueado si vence | Secundaria (prensa 2024 y 2025); texto pendiente |
| LDDPPSS Art. 13 | El paciente debe conocer nombre y número de registro del profesional | Nota clínica y documentos al paciente muestran nombre y número de junta del autor | Leída |
| Norma de laboratorios Art. 53 | Análisis por profesional inscrito en la junta | Validación de resultados ligada a credencial vigente (R07) | Leída |
| Norma de anestesiología Art. 9 | Supervisión por categoría | Privilegio con supervisor obligatorio (R09) | Leída |
| Código de Trabajo (jornada, extras, asuetos, vacaciones, aguinaldo hasta 20-dic) | Ver sección 1 | Validaciones y advertencias en turnos; exportación de incidencias | Secundaria |
| CT Art. 156 | Retención de 10% a servicios sin dependencia | Honorarios médicos (R16) | Leída |
| Ley ISSS, Ley Integral del Sistema de Pensiones | Cotizaciones | Fuera de alcance fase 1 | Pendiente |

## 5. Modelo resultante

- `staff_member`: persona (reusa identidad), vínculo (empleado, profesional externo con honorarios, residente, estudiante), unidad, supervisor, fechas efectivas.
- `professional_license`: junta, número, tipo, vigencia, fuente consultada, fecha de verificación, evidencia, verificador.
- `specialty_certification`: especialidad, emisor (CONADEM), número, vigencia.
- `privilege`: alcance (servicio, procedimiento, población, prescripción de controlados, validación de laboratorio, conducción de anestesia), condiciones (supervisión), aprobación, vigencia, versión.
- `shift` y `coverage`: planificado, real, guardia localizada, relevo.
- La autorización de un acto clínico evalúa permiso de rol **y** privilegio vigente **y** credencial vigente en la fecha del acto. Si falla, el acto no se firma y se ofrece relevo; la nota en borrador no se pierde.

## 6. Requisitos derivados

1. Credencial y certificación con vencimiento; alerta a 60 y 30 días al profesional y a dirección médica (umbral configurable).
2. Verificación en el acto (firma de nota, orden, prescripción, validación), no al iniciar sesión.
3. Vencimiento no borra autoría ni bloquea lectura; bloquea actos nuevos que requieren ese privilegio.
4. Profesional externo (médico con privilegios sin relación laboral) es caso de primera clase: honorarios por acto, retención 10%, no aparece en planilla.
5. Turnos con validación de jornada diurna, nocturna y mixta, descanso mínimo entre jornadas y advertencia de exceso.
6. Cobertura por servicio y función crítica (médico de emergencia, anestesia, enfermería por área) con hueco visible.
7. Exportación mensual a contabilidad: horas ordinarias, extra autorizadas, nocturnas, asuetos, guardias, honorarios por acto con retención.
8. Alta y baja de personal disparan alta y baja de cuentas, revocación de sesiones y entrega de pendientes (V8 ADM02).

## 7. Pendientes para CLIMESA

1. ¿Cuántos médicos son empleados y cuántos externos con privilegios? ¿Cómo les pagan?
2. ¿Llevan registro de juntas y vencimientos hoy? ¿Ya piden certificación CONADEM?
3. ¿Qué software de planilla usa el contador?
4. Esquema de turnos de enfermería (8 h, 12 h, 24 h) y cómo se pagan guardias.
5. ¿Hay residentes o estudiantes en rotación?

## Fuentes

- [El Mundo, Conadem registro público de especialistas (jul-2025)](https://diario.elmundo.sv/politica/conadem-ya-incluyo-5560-medicos-en-un-registro-publico-de-especialistas-donde-consultarlo): leída.
- [El Mundo, aprobada Ley de Especialidades (abr-2024)](https://diario.elmundo.sv/politica/aprobada-ley-solo-conadem-podra-certificar-especialidades-medicas-en-el-pais): leída.
- [Revista Summa, costo laboral (ago-2026)](https://revistasumma.com/?p=246626): leída (secundaria).
- [Jibble, resumen Código de Trabajo](https://www.jibble.io/es/legislacion-laboral/el-salvador): leída (secundaria).
- [CSSP requisitos JVPM](https://local.cssp.gob.sv/wp-content/uploads/2018/09/CSSP-JVPM-AP-2-2-Requisitos-para-Inscripción-Permanente-Doctorado-en-Medicina-JVPM.pdf): pendiente.
- LDDPPSS: leída. V8 G801-G805, G816-G817: heredadas.
