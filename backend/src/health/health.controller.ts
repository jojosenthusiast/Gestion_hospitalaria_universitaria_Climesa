import { Controller, Get } from '@nestjs/common';
import { ApiExtension, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../platform/database.service';
import { SupabaseService } from '../supabase/supabase.service';

@ApiTags('health')
@ApiExtension('x-permiso','publico')
@Controller()
export class HealthController {
  constructor(private readonly supabase: SupabaseService, private readonly db: DatabaseService) {}

  @Get('health')
  @ApiExtension('x-permiso','publico')
  @ApiOperation({ summary: 'Comprueba que la API está disponible' })
  @ApiResponse({ status: 200, description: 'API disponible' })
  getHealth(): { status: 'ok'; service: string; timestamp: string; integrations: { supabase: 'configured' | 'not_configured' } } {
    return {
      status: 'ok',
      service: 'sghu-climesa-backend',
      timestamp: new Date().toISOString(),
      integrations: { supabase: this.supabase.isConfigured() ? 'configured' : 'not_configured' },
    };
  }
  @Get('salud')
  @ApiExtension('x-permiso','publico')
  @ApiOperation({summary:'Readiness: API y conexión PostgreSQL operativas'})
  async readiness(){await this.db.query('SELECT 1 AS ready');return {status:'ok',database:'ok',timestamp:new Date().toISOString()};}

}
