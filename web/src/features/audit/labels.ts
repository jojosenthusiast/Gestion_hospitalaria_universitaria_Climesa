/**
 * Human wording for the audit table (S23): what each recorded action means as a short sentence, which area of the
 * hospital it belongs to, and what kind of thing it touched. Raw codes stay in the detail drawer only.
 */

/** Area of the hospital each action prefix belongs to, used to group the action filter. */
export const areaNames: Record<string, string> = {
  acceso: 'Acceso y seguridad', admision: 'Hospitalización', alta: 'Altas', ambulancia: 'Ambulancia', auditoria: 'Auditoría', avisos: 'Avisos',
  camas: 'Camas', cama: 'Camas', catalogo: 'Catálogos', citas: 'Citas', consulta: 'Consulta', cuenta: 'Cuentas', cuentas: 'Cuentas', datos: 'Exportaciones',
  diagnostico: 'Consulta', enfermeria: 'Enfermería', espacios: 'Edificio', espacio: 'Edificio', expediente: 'Expediente', fila: 'Fila de atención',
  idempotencia: 'Sistema', inventario: 'Inventario', laboratorio: 'Laboratorio', pacientes: 'Pacientes', personal: 'Personal', receta: 'Recetas',
  signos: 'Signos vitales', turnos: 'Turnos', usuarios: 'Cuentas y permisos', vinculacion: 'Vinculación de pacientes',
};

/** One sentence per known action, in past tense, as a person would say it. */
const sentences: Record<string, string> = {
  'acceso.denegado': 'Intentó una acción sin permiso',
  'admision.anular': 'Anuló una hospitalización', 'admision.autorizar': 'Autorizó una hospitalización', 'admision.cancelar': 'Canceló una hospitalización',
  'admision.crear': 'Registró una hospitalización', 'admision.factibilidad': 'Revisó si se podía hospitalizar', 'admision.leer': 'Consultó la hospitalización',
  'admision.origenes': 'Consultó el origen de una hospitalización', 'admision.salida': 'Registró la salida de un paciente', 'admision.solicitar': 'Solicitó una hospitalización',
  'admision.solicitar_alta': 'Solicitó un alta', 'admision.tratante': 'Cambió el médico tratante',
  'alta.firmar': 'Firmó un alta', 'alta.revocar': 'Revocó un alta',
  'ambulancia.cerrar': 'Cerró un servicio de ambulancia', 'ambulancia.despachar': 'Despachó una ambulancia', 'ambulancia.hito': 'Registró un avance del servicio de ambulancia',
  'ambulancia.hito_deshecho': 'Deshizo un avance del servicio de ambulancia', 'ambulancia.mantenimiento': 'Cambió el mantenimiento de una ambulancia',
  'ambulancia.prehospital': 'Registró la atención prehospitalaria', 'ambulancia.prehospital.ver': 'Consultó la atención prehospitalaria',
  'ambulancia.recepcion': 'Recibió un paciente de ambulancia', 'ambulancia.servicio.paciente.ver': 'Consultó el paciente de un servicio de ambulancia',
  'ambulancia.solicitar': 'Solicitó una ambulancia', 'ambulancia.solicitud.cancelar': 'Canceló una solicitud de ambulancia',
  'ambulancia.solicitud.descartar': 'Descartó una solicitud de ambulancia', 'ambulancia.solicitud.ver': 'Consultó una solicitud de ambulancia',
  'ambulancia.solicitud.ver_propia': 'Consultó su solicitud de ambulancia',
  'auditoria.consultar': 'Consultó la auditoría', 'auditoria.exportar': 'Exportó la auditoría', 'auditoria.mis_accesos': 'Revisó quién vio su expediente',
  'auditoria.verificar': 'Verificó la integridad de la auditoría',
  'avisos.editar': 'Editó un aviso', 'avisos.enterado': 'Marcó un aviso como leído', 'avisos.posponer': 'Pospuso un aviso', 'avisos.publicar': 'Publicó un aviso', 'avisos.retirar': 'Retiró un aviso',
  'cama.estado_cambiado': 'Cambió el estado de una cama', 'cama.limpieza_pendiente': 'Marcó una cama para limpieza',
  'camas.asignar': 'Asignó una cama', 'camas.mapa': 'Consultó el mapa de camas', 'camas.sugerencias': 'Consultó camas sugeridas', 'camas.trasladar': 'Trasladó a un paciente de cama',
  'camas.ver_tablero': 'Consultó el tablero de camas',
  'catalogo.examen_editado': 'Editó un examen del catálogo',
  'citas.agendar': 'Agendó una cita', 'citas.asignar': 'Asignó una cita', 'citas.cancelar': 'Canceló una cita', 'citas.catalogo_leer': 'Consultó el catálogo de citas',
  'citas.estado': 'Cambió el estado de una cita', 'citas.leer': 'Consultó citas', 'citas.no_asistio': 'Marcó una cita como no asistida',
  'citas.reprogramacion_rechazar': 'Rechazó una reprogramación de cita', 'citas.reprogramacion_vencer': 'Venció una reprogramación de cita', 'citas.reprogramar': 'Reprogramó una cita',
  'citas.reprogramar_solicitar': 'Pidió reprogramar una cita', 'citas.solicitar': 'Solicitó una cita', 'citas.solicitar_categoria': 'Solicitó una cita por especialidad',
  'citas.solicitud_cancelar': 'Canceló una solicitud de cita', 'citas.solicitud_rechazar': 'Rechazó una solicitud de cita', 'citas.solicitudes_leer': 'Consultó solicitudes de cita',
  'consulta.agenda_leer': 'Consultó la agenda de consultas', 'consulta.firmar': 'Firmó una consulta', 'consulta.guardar_borrador': 'Guardó el borrador de una consulta',
  'consulta.iniciar': 'Inició una consulta', 'consulta.leer': 'Consultó una consulta médica', 'consulta.sin_firmar_leer': 'Consultó consultas sin firmar',
  'cuenta.vincular': 'Vinculó su cuenta a un expediente', 'cuentas.verificar': 'Verificó una cuenta',
  'datos.exportar': 'Exportó una lista', 'diagnostico.registrar': 'Registró un diagnóstico',
  'enfermeria.leer': 'Consultó notas de enfermería', 'enfermeria.nota': 'Escribió una nota de enfermería',
  'espacios.crear': 'Creó un espacio del edificio', 'espacios.editar': 'Editó un espacio del edificio', 'espacio.actualizado': 'Editó un espacio del edificio',
  'expediente.leer': 'Consultó un expediente', 'expediente.ver': 'Consultó un expediente',
  'fila.anular': 'Anuló un turno de la fila', 'fila.cierre_del_dia': 'Cerró la fila del día', 'fila.deshacer_llamado': 'Deshizo un llamado de la fila', 'fila.emitir': 'Emitió un turno de la fila',
  'fila.leer': 'Consultó la fila de atención', 'fila.llamar': 'Llamó a un paciente de la fila', 'fila.prioridad': 'Cambió la prioridad de un turno de la fila',
  'idempotencia.conflicto': 'Repitió una operación con datos distintos',
  'inventario.articulo_crear': 'Creó un artículo de inventario', 'inventario.articulo_editar': 'Editó un artículo de inventario', 'inventario.articulo_eliminar': 'Retiró un artículo de inventario',
  'inventario.leer': 'Consultó el inventario', 'inventario.lote_crear': 'Creó un lote de inventario', 'inventario.lote_editar': 'Editó un lote de inventario',
  'laboratorio.adjunto_descargado': 'Descargó un adjunto de laboratorio', 'laboratorio.adjunto_subido': 'Subió un adjunto de laboratorio', 'laboratorio.cancelar': 'Canceló una orden de laboratorio',
  'laboratorio.completar': 'Completó una orden de laboratorio', 'laboratorio.enviar_externo': 'Envió una muestra a un laboratorio externo', 'laboratorio.leer': 'Consultó resultados de laboratorio',
  'laboratorio.muestra': 'Registró una muestra de laboratorio', 'laboratorio.ordenar': 'Ordenó exámenes de laboratorio', 'laboratorio.pendiente_revisado': 'Revisó un pendiente de laboratorio',
  'laboratorio.resultado': 'Registró un resultado de laboratorio', 'laboratorio.resultado_corregido': 'Corrigió un resultado de laboratorio',
  'laboratorio.resultado_enmendado': 'Enmendó un resultado de laboratorio', 'laboratorio.revisar': 'Revisó un resultado de laboratorio', 'laboratorio.validar': 'Validó un resultado de laboratorio',
  'laboratorio.seguimiento_confirmado': 'Confirmó un seguimiento de laboratorio', 'laboratorio.seguimiento_descartado': 'Descartó un seguimiento de laboratorio',
  'pacientes.buscar': 'Buscó pacientes', 'pacientes.ver_ficha': 'Abrió la ficha de un paciente', 'pacientes.registrar': 'Registró un paciente', 'pacientes.editar': 'Editó los datos de un paciente',
  'personal.crear': 'Registró a una persona del personal', 'personal.editar': 'Editó los datos de una persona del personal', 'personal.actualizado': 'Editó los datos de una persona del personal',
  'personal.inscripcion.registrar': 'Registró la inscripción profesional de una persona',
  'receta.emitir': 'Emitió una receta',
  'signos.leer': 'Consultó signos vitales', 'signos.registrar': 'Registró signos vitales',
  'turnos.asistencia': 'Registró la asistencia a un turno', 'turnos.avance_automatico': 'Actualizó los turnos en curso', 'turnos.cancelar': 'Canceló un turno de trabajo',
  'turnos.crear': 'Creó un turno de trabajo', 'turnos.crear_lote': 'Creó varios turnos de trabajo', 'turnos.mover': 'Movió un turno de trabajo',
  'turnos.plantilla_guardar': 'Guardó una plantilla de turnos', 'turnos.plantilla_retirar': 'Retiró una plantilla de turnos', 'turnos.publicar': 'Publicó los turnos de trabajo',
  'usuarios.estado': 'Activó o desactivó una cuenta', 'usuarios.invitacion.aceptar': 'Aceptó su invitación', 'usuarios.invitacion.cancelar': 'Canceló una invitación',
  'usuarios.invitacion.reenviar': 'Reenvió una invitación', 'usuarios.invitar': 'Invitó a una persona a crear su cuenta', 'usuarios.roles': 'Cambió los roles de una cuenta',
  'vinculacion.aprobar': 'Aprobó la vinculación de un paciente', 'vinculacion.leer': 'Consultó vinculaciones de pacientes', 'vinculacion.rechazar': 'Rechazó la vinculación de un paciente',
};

const area = (action: string) => action.split('.')[0];
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** «usuarios.roles» → «Cambió los roles de una cuenta». An unknown code reads as «Área: palabras del código». */
export function actionSentence(action: string) {
  if (sentences[action]) return sentences[action];
  const rest = action.split('.').slice(1).join(' ').replace(/_/g, ' ');
  const name = areaNames[area(action)];
  if (!name) return capitalize(action.replace(/[_.]/g, ' '));
  return rest ? `${name}: ${rest}` : name;
}

export const actionArea = (action: string) => areaNames[area(action)] ?? capitalize(area(action));

/** What an audit row refers to, by kind. */
const entityNames: Record<string, string> = {
  admision: 'Hospitalización', alta: 'Alta', articulo: 'Artículo de inventario', auditoria: 'Auditoría', aviso: 'Aviso', cama: 'Cama', caso_duplicado: 'Paciente duplicado',
  cita: 'Cita', consulta: 'Consulta', diagnostico: 'Diagnóstico', endpoint: 'Pantalla o servicio', espacio: 'Espacio del edificio', examen_laboratorio: 'Examen del catálogo',
  existencia: 'Existencias', idempotencia: 'Operación repetida', lote: 'Lote de inventario', movimiento: 'Movimiento de inventario', nota_enfermeria: 'Nota de enfermería',
  ocupacion_cama: 'Cama', orden_laboratorio: 'Orden de laboratorio', paciente: 'Paciente', personal: 'Persona del personal', planificacion: 'Planificación de turnos',
  plantilla_semana: 'Plantilla de turnos', receta: 'Receta', reprogramacion: 'Reprogramación de cita', resultado_laboratorio: 'Resultado de laboratorio', servicio: 'Servicio de ambulancia',
  signos_vitales: 'Signos vitales', solicitud: 'Solicitud de ambulancia', solicitud_cita: 'Solicitud de cita', ticket_fila: 'Turno de la fila', traslado: 'Traslado',
  turno: 'Turno de trabajo', unidad: 'Ambulancia', usuario: 'Cuenta', vinculacion_paciente: 'Vinculación de paciente',
};
export const entityName = (entity: string) => entityNames[entity] ?? capitalize(entity.replace(/_/g, ' '));
