import { BadRequestException } from '@nestjs/common';
import {normalize,phonetic,validDui,recordNumber,validateDemographics,matchReasons,birthPrecision} from '../src/patients/patient.rules';
describe('Reglas de identidad del paciente',()=>{
 const today=new Date('2026-10-24T12:00:00Z');
 const data={givenNames:'Ana Lucía',surnames:'Ejemplo Hernández',sex:'femenino'};
 test('acentos y equivalencias fonéticas conservan resultados de búsqueda',()=>{expect(normalize('  ANA  Lucía ')).toBe('ana lucia');expect(phonetic('Hernández')).toBe(phonetic('ernandes'));});
 test('DUI exige dígito verificador y rechaza ceros',()=>{expect(validDui('00000001-8')).toBe(true);expect(validDui('00000001-9')).toBe(false);expect(validDui('00000000-0')).toBe(false);});
 test('el expediente usa MOD 11-2 e incluye X cuando corresponde',()=>{expect(recordNumber(1)).toBe('0000001-X');expect(recordNumber(2)).toBe('0000002-8');});
 test.each(['2026-10-25','2025-02-29','1900-01-01'])('rechaza nacimiento inválido %s',birth=>{expect(()=>validateDemographics({...data,birth},today)).toThrow(BadRequestException);});
 test('identidad provisional exige edad y señas suficientes',()=>{expect(()=>validateDemographics({...data,provisional:true,estimatedAge:121,description:'Sin identificación'},today)).toThrow(BadRequestException);});
 describe('expediente ISO 7064 MOD 11-2 (FR-102-04)',()=>{
  test.each([[1,'0000001-X'],[2,'0000002-8'],[3,'0000003-6'],[10,'0000010-8'],[12,'0000012-4'],[99,'0000099-2'],[1234567,'1234567-2'],[9999999,'9999999-3']])('la secuencia %s produce %s',(sequence,record)=>{expect(recordNumber(sequence)).toBe(record);});
  test.each([['000000021825009','7'],['000000021694233','X'],['000000015109370','0']])('coincide con el vector público ISO 7064 %s',(body,check)=>{expect(recordNumber(body)).toBe(`${body}-${check}`);});
  test('acepta la secuencia como texto de la base y la rellena a siete cifras',()=>{expect(recordNumber('2')).toBe(recordNumber(2));expect(recordNumber(7)).toHaveLength(9);});
 });
 describe('DUI (FR-102-03)',()=>{
  test.each(['00000001-8','000000018','12345678-4'])('acepta el DUI válido %s',dui=>{expect(validDui(dui)).toBe(true);expect(()=>validateDemographics({...data,dui},today)).not.toThrow();});
  test.each(['12345678-5','00000000-0','1234567-8','abcdefgh-1','123456789-0'])('rechaza el DUI inválido %s',dui=>{expect(()=>validateDemographics({...data,dui},today)).toThrow(BadRequestException);});
  test('guarda el DUI sin guion',()=>{expect(validateDemographics({...data,dui:'00000001-8'},today).dui).toBe('000000018');});
 });
 describe('nombres, teléfono y correo (FR-102-01)',()=>{
  test.each(['Ana2','A','Ana_Lucía','<b>Ana</b>',' '])('rechaza el nombre inválido "%s"',givenNames=>{expect(()=>validateDemographics({...data,givenNames},today)).toThrow(BadRequestException);});
  test.each(["O'Connor",'María José','De la Cruz-Peña','Ana Lucía'])('acepta el nombre con apóstrofo, guion, tilde o espacio "%s"',surnames=>{expect(()=>validateDemographics({...data,surnames},today)).not.toThrow();});
  test.each(['7000-0000','70000000','2222-3333','6123-4567'])('acepta el teléfono %s y lo guarda sin guion',phone=>{expect(validateDemographics({...data,phone},today).phone).toBe(phone.replace('-',''));});
  test.each(['1000-0000','7000-000','abcd-efgh','7000 0000'])('rechaza el teléfono %s',phone=>{expect(()=>validateDemographics({...data,phone},today)).toThrow(BadRequestException);});
  test.each(['ana@example.test','ana.perez+hu@example.org'])('acepta el correo %s',email=>{expect(()=>validateDemographics({...data,email},today)).not.toThrow();});
  test.each(['ana','ana@','@example.test','ana@example','ana perez@example.test'])('rechaza el correo %s',email=>{expect(()=>validateDemographics({...data,email},today)).toThrow(BadRequestException);});
  test('rechaza un sexo fuera del catálogo',()=>{expect(()=>validateDemographics({...data,sex:'otro'},today)).toThrow(BadRequestException);});
 });
 describe('identidad provisional (FR-102-05)',()=>{
  const provisional={givenNames:'',surnames:'',sex:'no_registrado',provisional:true,estimatedAge:35,description:'Hombre adulto con tatuaje en el antebrazo'};
  test('acepta nombres vacíos, edad estimada y señas suficientes sin inventar fecha',()=>{
   const result=validateDemographics(provisional,today);
   expect(result.givenNames).toBe('');expect(result.birth).toBeNull();expect(result.dui).toBeNull();
  });
  test.each([[0],[120]])('acepta la edad estimada límite %s',estimatedAge=>{expect(()=>validateDemographics({...provisional,estimatedAge},today)).not.toThrow();});
  test.each([[-1,'Hombre adulto con tatuaje'],[35,'Muy corta'],[undefined,'Hombre adulto con tatuaje']])('rechaza edad %s con señas "%s"',(estimatedAge,description)=>{expect(()=>validateDemographics({...provisional,estimatedAge:estimatedAge as number|undefined,description} as any,today)).toThrow(BadRequestException);});
 });
 describe('motivos de coincidencia (FR-102-01)',()=>{
  const base={fullName:'José Hernández Vásquez',record:'0000001-X',dui:'00000001-8',birth:'1985-07-14'};
  test('una búsqueda fonética no pide el nombre exacto',()=>{expect(matchReasons({...base,query:'hernandes basquez jose'})).toEqual(['Coincidencia fonética']);});
  test('el nombre escrito igual es coincidencia de nombre',()=>{expect(matchReasons({...base,query:'jose hernandez'})).toEqual(['Coincidencia de nombre']);});
  test('el DUI y el expediente son motivos distintos',()=>{expect(matchReasons({...base,query:'00000001-8'})).toEqual(['Coincidencia de documento']);expect(matchReasons({...base,dui:'12345678-4',query:'0000001-X'})).toEqual(['Coincidencia de expediente']);});
  test('la fecha exacta es coincidencia de fecha de nacimiento',()=>{expect(matchReasons({...base,query:'1985-07-14'})).toEqual(['Coincidencia de fecha de nacimiento']);});
  test('cuando coinciden varios criterios se informan todos',()=>{expect(matchReasons({...base,fullName:'Ana 0000001',query:'0000001'})).toEqual(['Coincidencia de documento','Coincidencia de expediente','Coincidencia de nombre']);});
  test('sin texto de búsqueda es un listado, no una coincidencia',()=>{expect(matchReasons({...base,query:'  '})).toEqual(['Listado sin criterio de búsqueda']);});
 });
 describe('precisión del nacimiento al editar (FR-102-05)',()=>{
  test('una fecha estimada que no cambia sigue estimada',()=>{expect(birthPrecision({birth:'1996-01-01',precision:'estimada'},'1996-01-01')).toBe('estimada');});
  test('un provisional sin fecha sigue estimado',()=>{expect(birthPrecision({birth:null,precision:'estimada'},null)).toBe('estimada');});
  test('una fecha nueva escrita por quien edita es exacta',()=>{expect(birthPrecision({birth:'1996-01-01',precision:'estimada'},'1995-03-02')).toBe('exacta');});
  test('un paciente normal conserva exacta o desconocida',()=>{expect(birthPrecision({birth:'1990-02-03',precision:'exacta'},'1990-02-03')).toBe('exacta');expect(birthPrecision({birth:null,precision:'desconocida'},null)).toBe('desconocida');expect(birthPrecision({birth:'1990-02-03',precision:'exacta'},null)).toBe('desconocida');});
 });});
