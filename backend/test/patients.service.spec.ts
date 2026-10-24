import { BadRequestException } from '@nestjs/common';
import {normalize,phonetic,validDui,recordNumber,validateDemographics} from '../src/patients/patient.rules';
describe('Reglas de identidad del paciente',()=>{
 const today=new Date('2026-10-24T12:00:00Z');
 const data={givenNames:'Ana Lucía',surnames:'Ejemplo Hernández',sex:'femenino'};
 test('acentos y equivalencias fonéticas conservan resultados de búsqueda',()=>{expect(normalize('  ANA  Lucía ')).toBe('ana lucia');expect(phonetic('Hernández')).toBe(phonetic('ernandes'));});
 test('DUI exige dígito verificador y rechaza ceros',()=>{expect(validDui('00000001-8')).toBe(true);expect(validDui('00000001-9')).toBe(false);expect(validDui('00000000-0')).toBe(false);});
 test('el expediente usa MOD 11-2 e incluye X cuando corresponde',()=>{expect(recordNumber(1)).toBe('0000001-X');expect(recordNumber(2)).toBe('0000002-8');});
 test.each(['2026-10-25','2025-02-29','1900-01-01'])('rechaza nacimiento inválido %s',birth=>{expect(()=>validateDemographics({...data,birth},today)).toThrow(BadRequestException);});
 test('identidad provisional exige edad y señas suficientes',()=>{expect(()=>validateDemographics({...data,provisional:true,estimatedAge:121,description:'Sin identificación'},today)).toThrow(BadRequestException);});
});
