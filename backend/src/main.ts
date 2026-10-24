import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ApiErrorsFilter } from './platform/errors.filter';
import { CommandService } from './platform/command.service';
export function configureApplication(app:NestFastifyApplication) {
  const config=app.get(ConfigService);
  if(config.get('NODE_ENV')==='production'&&!config.get<string>('SUPABASE_URL')?.startsWith('https://'))throw new Error('Supabase requiere HTTPS en producción.');
  const prefix=config.get<string>('API_PREFIX','api/v1');
  app.setGlobalPrefix(prefix,{exclude:[{path:'salud',method:RequestMethod.GET}]});
  app.enableCors({origin:config.get<string>('WEB_APP_URL','http://localhost:5173'),methods:['GET','POST','PATCH','PUT','DELETE','OPTIONS'],allowedHeaders:['Authorization','Content-Type','Idempotency-Key']});
  app.getHttpAdapter().getInstance().addHook('onSend',async(_request:unknown,reply:{header:(name:string,value:string)=>unknown},payload:unknown)=>{reply.header('Cache-Control','no-store');return payload;});
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true,forbidUnknownValues:true}));
  app.useGlobalFilters(new ApiErrorsFilter(app.get(CommandService)));
  const document=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('SGHU-CLIMESA API').setDescription('Core S1/S2: autorización, pacientes, personal, espacios y turnos. Cada operación incluye x-permiso. Las escrituras requieren Idempotency-Key.').setVersion('0.3.0').addBearerAuth().build());
  for(const path of Object.values(document.paths))for(const method of ['post','patch','put','delete'] as const){const op=path[method];if(op&&op['x-permiso' as keyof typeof op]!=='pacientes.buscar'){op.parameters??=[];op.parameters.push({name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:8,maxLength:128}});}}
  SwaggerModule.setup(`${prefix}/docs`,app,document,{jsonDocumentUrl:'/openapi/v1.json'});
  return document;
}
export async function createApplication() {
  const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter({ logger:process.env.NODE_ENV==='production'?{serializers:{req:(r:{method:string;url:string;id:string})=>({method:r.method,url:r.url.split('?')[0],id:r.id})},redact:['req.headers.authorization','req.headers.cookie']}:false }));
  const document=configureApplication(app);
  return {app,document};
}
if(require.main===module)void createApplication().then(async({app})=>app.listen(app.get(ConfigService).get<number>('PORT',3000),'0.0.0.0'));
