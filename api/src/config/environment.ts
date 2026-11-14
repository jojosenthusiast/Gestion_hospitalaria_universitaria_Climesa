/**
 * Production environment check (API-19, PRO-08). Config code carries no real project URL or key as a default: in production the
 * API refuses to start unless each required variable comes from the environment. Development and tests keep their local defaults.
 * It reads `process.env` directly because the Joi schema in `app.module.ts` fills defaults before `ConfigService` sees the values.
 */
export const REQUIRED_IN_PRODUCTION = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'DATABASE_URL'] as const;

/** Problems that block a production start; empty when the environment is valid or is not production. */
export function productionEnvironmentProblems(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const value = (name: string) => env[name]?.trim() ?? '';
  const problems = REQUIRED_IN_PRODUCTION.filter(name => !value(name)).map(name => `Falta la variable ${name}.`);
  if (value('SUPABASE_URL') && !value('SUPABASE_URL').startsWith('https://')) problems.push('Supabase requiere HTTPS en producción.');
  if (!value('SUPABASE_SECRET_KEY') && !value('SUPABASE_SERVICE_ROLE_KEY')) problems.push('Falta la variable SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY).');
  return problems;
}

/** Throws with every problem at once so the deploy log shows what to fix. */
export function assertProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const problems = productionEnvironmentProblems(env);
  if (problems.length) throw new Error(`Configuración de producción incompleta: ${problems.join(' ')}`);
}
