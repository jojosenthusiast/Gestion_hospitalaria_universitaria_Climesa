import { useMemo } from 'react';
import { Icon } from '../../components/ui';
import { roleNames, type AccessProfile, type Api } from '../../lib/api';
import { Heading } from '../common';
import { NoticesPanel } from '../avisos/NoticesPanel';
import { WorkInbox } from '../inbox';
import { useDashboardData, type Source } from './data';
import { QuickActions } from './parts';
import { roleDashboards, roleOrder, type RoleId } from './roles';

/**
 * W04 · Inicio por rol. Cada rol tiene su propio tablero (cifras con estado de color, gráficos, lista de lo que
 * necesita atención con su acción directa y acciones rápidas reales). Una cuenta con varios roles ve sus tableros
 * uno tras otro, sin selector. Todo se calcula con los listados existentes y respeta los permisos de la cuenta.
 */
export function Dashboard({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const roles = useMemo(() => roleOrder.filter(role => profile.roles.includes(role)), [profile.roles]);
  const needed = useMemo(() => new Set<Source>(roles.flatMap(role => roleDashboards[role].needs)), [roles]);
  const data = useDashboardData(api, profile, version, needed);
  const first = profile.name ? profile.name.split(' ')[0] : '';
  const greeting = `Bienvenido${first ? ', ' + first : ''}.`;
  if (roles.length === 0) return <>
    <Heading eyebrow="CLIMESA / Inicio" title="Inicio" description={`${greeting} Tu cuenta está activa.`} />
    <NoticesPanel api={api} version={version} />
    <div className="dashboard-account"><Icon name="shield" size={24} /><div><h3>Tu función no tiene un tablero en la web</h3><p>Usa los módulos del menú que tu cuenta tiene habilitados. Las operaciones y los datos corresponden a los roles de tu cuenta.</p></div><a className="row-action" href="#/perfil">Ver mi cuenta <Icon name="arrow" size={16} /></a></div>
  </>;
  const many = roles.length > 1;
  return <>
    <Heading eyebrow="CLIMESA / Inicio" title={roleDashboards[roles[0]].title} description={`${greeting} ${roleDashboards[roles[0]].description}`} />
    <NoticesPanel api={api} version={version} />
    {roles.map((role: RoleId, index) => {
      const dash = roleDashboards[role];
      return <div className="role-dashboard" key={role}>
        {many && <h2 className="role-section-title">{index === 0 ? '' : `${dash.title} · `}{roleNames[role] ?? role}</h2>}
        <QuickActions actions={dash.actions} profile={profile} />
        {index === 0 && <WorkInbox api={api} profile={profile} version={version} />}
        {dash.render({ d: data, profile })}
      </div>;
    })}
    <div className="dashboard-account"><Icon name="shield" size={24} /><div><h3>Acceso según tu función</h3><p>Las operaciones y los datos disponibles corresponden a los roles de tu cuenta.</p></div><a className="row-action" href="#/perfil">Ver mi cuenta <Icon name="arrow" size={16} /></a></div>
  </>;
}
