import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApplication } from '../src/main';
void createApplication().then(async({app,document})=>{writeFileSync(resolve(__dirname,'../../contrato/openapi.json'),JSON.stringify(document,null,2)+'\n');await app.close();});
