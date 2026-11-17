import { ApiError } from '../lib/api';

/**
 * Problem codes whose server text is replaced by a fixed Spanish sentence. For `validacion` and `conflicto` the API
 * `detail` is already Spanish and names the field or the cause, so it is kept and only a missing text gets a fallback.
 */
const fixed: Record<string, string> = {
  transicion_invalida: 'El registro cambió de estado; vuelve a cargar.',
  version_conflicto: 'Este registro cambió mientras lo tenías abierto.',
  sin_permiso: 'Tu cuenta no tiene permiso para esta acción.',
  no_encontrado: 'No encontramos este registro; vuelve a cargar.',
  servicio_finalizado: 'El servicio ya terminó; vuelve a cargar.',
  servicio_cerrado: 'El servicio ya terminó; vuelve a cargar.',
  sin_servicio_activo: 'La unidad ya no tiene un servicio activo; vuelve a cargar.',
  sin_paramedico_de_turno: 'No hay paramédico con cuenta en la app con turno en curso.',
  adjunto_tipo_invalido: 'El archivo no es un PDF ni una foto JPG, PNG, HEIC o WEBP.',
  adjunto_muy_grande: 'El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.',
  adjunto_sin_archivo: 'Este adjunto solo tiene la referencia: el archivo no se guardó en el sistema.',
  adjunto_ya_almacenado: 'Este adjunto ya tiene su archivo guardado.',
  adjunto_no_coincide: 'El archivo no coincide con el que se adjuntó al resultado; sube el mismo archivo.',
};
const fallback: Record<string, string> = {
  validacion: 'Revisa los datos e intenta de nuevo.',
  conflicto: 'No se pudo completar porque el registro cambió; vuelve a cargar.',
};

/** Same error with a Spanish message for known problem codes; anything else is returned untouched. */
export function spanishProblem(error: ApiError | null): ApiError | null {
  if (!error?.code) return error;
  const message = fixed[error.code] ?? (error.message ? undefined : fallback[error.code]);
  return message ? new ApiError(message, error.status, error.code, error.currentVersion, error.details) : error;
}
