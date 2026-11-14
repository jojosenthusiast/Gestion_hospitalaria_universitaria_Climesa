import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ProblemException } from './problem';

/** MOV-03: one Spanish message per invalid field of the body or query, keyed by its wire name. */
export interface FieldError { field: string; message: string }

const number = (text: string) => /(-?\d+(?:\.\d+)?)/.exec(text.replace(/^.*?(?:than or equal to|less than|greater than|no more than|at least)\s*/, ''))?.[1];
const chars = (n: string) => `${n} ${n === '1' ? 'carácter' : 'caracteres'}`;
const items = (n: string) => `${n} ${n === '1' ? 'elemento' : 'elementos'}`;
const values = (text: string) => /following values:\s*(.*)$/.exec(text)?.[1]?.trim();

/** Spanish text for each class-validator constraint the DTOs use; `text` is the default English message (it carries the limits). */
const MESSAGES: Record<string, (text: string) => string> = {
  isDefined: () => 'Es obligatorio.',
  isNotEmpty: () => 'Es obligatorio.',
  isString: () => 'Debe ser texto.',
  isUuid: () => 'Debe ser un identificador (UUID) válido.',
  isIn: text => values(text) ? `Debe ser uno de estos valores: ${values(text)}.` : 'No es un valor permitido.',
  isEnum: text => values(text) ? `Debe ser uno de estos valores: ${values(text)}.` : 'No es un valor permitido.',
  minLength: text => number(text) ? `Debe tener al menos ${chars(number(text)!)}.` : 'Es demasiado corto.',
  maxLength: text => number(text) ? `Debe tener como máximo ${chars(number(text)!)}.` : 'Es demasiado largo.',
  isInt: () => 'Debe ser un número entero.',
  isNumber: () => 'Debe ser un número.',
  min: text => number(text) ? `Debe ser mayor o igual a ${number(text)}.` : 'Es demasiado pequeño.',
  max: text => number(text) ? `Debe ser menor o igual a ${number(text)}.` : 'Es demasiado grande.',
  isBoolean: () => 'Debe ser verdadero o falso.',
  isBooleanString: () => 'Debe ser "true" o "false".',
  isIso8601: () => 'Debe ser una fecha válida en formato ISO 8601.',
  isEmail: () => 'Debe ser un correo electrónico válido.',
  matches: () => 'No tiene el formato esperado.',
  isArray: () => 'Debe ser una lista.',
  arrayNotEmpty: () => 'Debe tener al menos un elemento.',
  arrayMinSize: text => number(text) ? `Debe tener al menos ${items(number(text)!)}.` : 'Tiene muy pocos elementos.',
  arrayMaxSize: text => number(text) ? `Debe tener como máximo ${items(number(text)!)}.` : 'Tiene demasiados elementos.',
  arrayUnique: () => 'No puede repetir elementos.',
  notEquals: () => 'No admite ese valor.',
  nestedValidation: () => 'Debe ser un objeto con la forma esperada.',
  whitelistValidation: () => 'Este campo no se admite en la solicitud.',
  unknownValue: () => 'El cuerpo de la solicitud no es válido.',
};
/** When a field breaks several rules, the most basic one is the useful message (a missing text is "obligatorio", not "muy corto"). */
const PRIORITY = ['whitelistValidation', 'isDefined', 'isNotEmpty', 'nestedValidation', 'isArray', 'isString', 'isInt', 'isNumber', 'isBoolean', 'isBooleanString', 'isUuid', 'isIso8601', 'isEmail', 'isIn', 'isEnum'];
/** The default class-validator messages are English; a decorator with its own `message` already speaks Spanish. */
const ENGLISH = /\b(must|should|an unknown value)\b/;

function message(error: ValidationError): string {
  const constraints = error.constraints ?? {};
  const keys = Object.keys(constraints).sort((a, b) => rank(a) - rank(b));
  const key = keys[0];
  const text = constraints[key] ?? '';
  if (!ENGLISH.test(text)) return text;
  const missing = error.value === undefined || error.value === null;
  if (missing && key !== 'whitelistValidation' && key !== 'unknownValue') return 'Es obligatorio.';
  const spanish = (MESSAGES[key] ?? (() => 'No es un valor válido.'))(text);
  return /^each value in /.test(text) ? `Cada elemento: ${spanish.charAt(0).toLowerCase()}${spanish.slice(1)}` : spanish;
}
const rank = (key: string) => { const i = PRIORITY.indexOf(key); return i < 0 ? PRIORITY.length : i; };

/** Flattens nested errors to wire paths (`items[0].dose`) and keeps one Spanish message per field. */
export function fieldErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap(error => {
    const property = error.property ?? '';
    const field = !property ? parent : /^\d+$/.test(property) ? `${parent}[${property}]` : parent ? `${parent}.${property}` : property;
    const own = error.constraints && Object.keys(error.constraints).length ? [{ field, message: message(error) }] : [];
    return [...own, ...fieldErrors(error.children ?? [], field)];
  });
}

/** Spanish summary for `detail`: names the fields so a client without a matching input can still show something useful. */
export function validationDetail(errors: FieldError[]): string {
  if (errors.length === 1) {
    const [only] = errors;
    return only.field ? `Revisa el campo ${only.field}: ${only.message.charAt(0).toLowerCase()}${only.message.slice(1)}` : only.message;
  }
  return `Revisa los campos: ${[...new Set(errors.map(e => e.field || 'cuerpo'))].join(', ')}.`;
}

/** Global pipe of the API: same options as before, with the validation failure translated into problem+json members. */
export function validationPipe() {
  return new ValidationPipe({
    whitelist: true, transform: true, forbidNonWhitelisted: true, forbidUnknownValues: true,
    // `value` stays server-side: it only tells a missing field ("obligatorio") from a wrong one; it never reaches the body.
    validationError: { target: false, value: true },
    exceptionFactory: (raw: ValidationError[]) => {
      const errors = fieldErrors(raw);
      return new ProblemException('validacion', 400, validationDetail(errors), errors.find(e => e.field)?.field, { errors });
    },
  });
}
