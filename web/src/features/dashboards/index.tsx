import { useMemo } from 'react';
import { can, roleNames, type AccessProfile, type Api } from '../../lib/api';
import { CompactHeader } from '../common';
import { CriticalNoticeBanner } from '../avisos/CriticalNoticeBanner';
import { WorkInbox } from '../inbox';
import { useDashboardData, type Source } from './data';
import { LabFollowUpPanel } from './lab-follow-up';
import { LabResultsInbox } from './lab-results-inbox';
import { QuickActions } from './parts';
import { roleDashboards, roleOrder, type RoleId } from './roles';

/**
 * W04 · Inicio por rol. Cada rol tiene su propio tablero (cifras con estado de color, gráficos, lista de lo que
 * necesita atención con su acción directa y acciones rápidas reales). Una cuenta con varios roles ve sus tableros
 * uno tras otro, sin selector. Todo se calcula con los listados existentes y respeta los permisos de la cuenta.
 * Los avisos viven en su propia área (S11); aquí solo aparece el crítico dirigido a la cuenta, hasta su «Enterado».
 */
export function Dashboard({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const roles = useMemo(() => roleOrder.filter(role => profile.roles.includes(role)), [profile.roles]);
  const needed = useMemo(() => new Set<Source>(roles.flatMap(role => roleDashboards[role].needs)), [roles]);
  const data = useDashboardData(api, profile, version, needed);
  if (roles.length === 0) return <>
    <CompactHeader breadcrumb="CLIMESA / Inicio" title="Inicio" />
    <CriticalNoticeBanner api={api} version={version} />
    {/* R1: one quiet line with the way out; no decorative card. */}
    <p className="section-empty" role="status"><strong>Tu función no tiene un tablero en la web</strong> · <a className="row-action" href="#/perfil">Ver mi cuenta</a></p>
  </>;
  const many = roles.length > 1;
  return <>
    <CompactHeader breadcrumb="CLIMESA / Inicio" title={roleDashboards[roles[0]].title} />
    <CriticalNoticeBanner api={api} version={version} />
    {roles.map((role: RoleId, index) => {
      const dash = roleDashboards[role];
      return <div className="role-dashboard" key={role}>
        {many && <h2 className="role-section-title">{index === 0 ? '' : `${dash.title} · `}{roleNames[role] ?? role}</h2>}
        <QuickActions actions={dash.actions} profile={profile} />
        {index === 0 && <WorkInbox api={api} profile={profile} version={version} />}
        {/* S10: citas de seguimiento que el sistema propone al llegar resultados; Recepción las confirma. */}
        {index === 0 && can(profile, 'citas.agendar') && <LabFollowUpPanel api={api} version={version} />}
        {/* S10: «Resultados por revisar» del médico (valores críticos y observaciones); se oculta sin `laboratorio.revisar`. */}
        {index === 0 && <LabResultsInbox api={api} profile={profile} version={version} />}
        {dash.render({ d: data, profile })}
      </div>;
    })}
  </>;
}
