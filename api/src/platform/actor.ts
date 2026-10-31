export type Permission = { code: string; context: string };
export type Actor = {
  id: string;
  email: string;
  name: string;
  roles: string[];
  platforms: string[];
  permissions: Permission[];
  channels: string[];
  patientId: string | null;
  staffId: string | null;
};
export type ActorRequest = {
  user: { id: string; email?: string };
  actor: Actor;
  headers: Record<string, string | undefined>;
  id: string;
  method: string;
  url: string;
  permission?: string;
  denialAudited?: boolean;
};
export const hasPermission = (actor: Actor, code: string) => actor.permissions.some(p => p.code === code);
/** Contextos con los que el actor tiene el permiso (vacío si no lo tiene). */
export const contextsOf = (actor: Pick<Actor, 'permissions'>, code: string) => actor.permissions.filter(p => p.code === code).map(p => p.context);
