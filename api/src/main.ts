import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ApiErrorsFilter } from './platform/errors.filter';
import { CommandService } from './platform/command.service';
import { completeDocument } from './platform/openapi';
/** FR-100-15: el registro de solicitudes solo lleva método, ruta sin consulta e id; nunca cuerpos, encabezados ni cookies. */
export const requestLogging={serializers:{req:(r:{method:string;url:string;id:string})=>({method:r.method,url:r.url.split('?')[0],id:r.id})},redact:['req.headers.authorization','req.headers.cookie']};
export function configureApplication(app:NestFastifyApplication) {
  const config=app.get(ConfigService);
  if(config.get('NODE_ENV')==='production'&&!config.get<string>('SUPABASE_URL')?.startsWith('https://'))throw new Error('Supabase requiere HTTPS en producción.');
  const prefix=config.get<string>('API_PREFIX','api/v1');
  app.setGlobalPrefix(prefix,{exclude:[{path:'salud',method:RequestMethod.GET}]});
  const primaryWebOrigin=config.get<string>('WEB_APP_URL','http://localhost:5173');
  const extraWebOrigins=config.get<string>('WEB_APP_URLS','').split(',').map((origin)=>origin.trim()).filter(Boolean);
  const allowedWebOrigins=[...new Set([primaryWebOrigin,...extraWebOrigins])];
  app.enableCors({origin:allowedWebOrigins,methods:['GET','POST','PATCH','PUT','DELETE','OPTIONS'],allowedHeaders:['Authorization','Content-Type','Idempotency-Key']});
  app.getHttpAdapter().getInstance().addHook('onSend',async(_request:unknown,reply:{header:(name:string,value:string)=>unknown},payload:unknown)=>{reply.header('Cache-Control','no-store');return payload;});
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true,forbidUnknownValues:true}));
  app.useGlobalFilters(new ApiErrorsFilter(app.get(CommandService)));
  const document=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('SGHU-CLIMESA API').setDescription('API de SGHU-CLIMESA. Cada operación incluye x-permiso. Las escrituras requieren Idempotency-Key (una por intención) y, si cambian un registro existente, su `version` en el cuerpo; un conflicto responde 409 problem+json con `codigo`. JSON en camelCase (docs/arquitectura/convenciones-api.md).').setVersion('0.4.0').addBearerAuth().build());
  completeDocument(document);
  SwaggerModule.setup(`${prefix}/docs`,app,document,{jsonDocumentUrl:'/openapi/v1.json'});
  return document;
}
export async function createApplication() {
  const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter({ logger:process.env.NODE_ENV==='production'?requestLogging:false }));
  const document=configureApplication(app);
  return {app,document};
}
if(require.main===module)void createApplication().then(async({app})=>app.listen(app.get(ConfigService).get<number>('PORT',3000),'0.0.0.0'));
