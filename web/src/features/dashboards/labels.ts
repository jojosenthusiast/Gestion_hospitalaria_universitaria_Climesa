/**
 * R4a (W-DPD-2, W-DPD-5): audit actions arrive as internal codes («admision.leer», «ticket_fila»). Users read a label.
 * Unknown parts fall back to words, never to the dotted code.
 */
const DOMAINS: Record<string, string> = {
  admision: 'Admisión', ambulancia: 'Ambulancia', auditoria: 'Auditoría', camas: 'Camas', citas: 'Citas', consulta: 'Consulta', consultas: 'Consultas',
  cuenta: 'Cuenta', cuentas: 'Cuentas', espacios: 'Espacios', expediente: 'Expediente', fila: 'Fila', inventario: 'Inventario', laboratorio: 'Laboratorio',
  metricas: 'Métricas', pacientes: 'Pacientes', paciente: 'Paciente', personal: 'Personal', resultados: 'Resultados', sesion: 'Sesión', turnos: 'Turnos',
  usuarios: 'Cuentas', avisos: 'Avisos', alta: 'Alta', recetas: 'Recetas', signos: 'Signos vitales', enfermeria: 'Enfermería', catalogo: 'Catálogo',
};
const WORDS: Record<string, string> = {
  leer: 'consulta', ver: 'consulta', consultar: 'consulta', listar: 'consulta', crear: 'registro', registrar: 'registro', emitir: 'emisión', editar: 'cambio',
  actualizar: 'cambio', corregir: 'corrección', cancelar: 'cancelación', eliminar: 'eliminación', exportar: 'exportación', solicitar: 'solicitud',
  solicitud: 'solicitudes', solicitudes: 'solicitudes', tablero: 'tablero', estado: 'estado', cola: 'cola', despachar: 'despacho', llamar: 'llamado',
  asignar: 'asignación', verificar: 'verificación', firmar: 'firma', publicar: 'publicación', ticket: 'número', fila: 'fila',
};
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const words = (code: string) => code.split('_').map(w => WORDS[w] ?? w).filter((w, i, all) => all.indexOf(w) === i).join(' ');
export function auditActionLabel(code: string) {
  const [domain, ...rest] = code.split('.');
  const verb = rest.join(' ').split(' ').map(words).join(' ');
  return verb ? `${DOMAINS[domain] ?? cap(words(domain))} · ${verb}` : DOMAINS[domain] ?? cap(words(domain));
}
