import { useMemo } from 'react';
import { can, type AccessProfile, type Api } from '../../lib/api';
import { CompactHeader } from '../common';
import { CriticalNoticeBanner } from '../avisos/CriticalNoticeBanner';
import { useDashboardData, type Source } from './data';
import { LabFollowUpPanel } from './lab-follow-up';
import { LabResultsInbox } from './lab-results-inbox';
import { DayFigures, PendingTray, QuickActions, type Figure, type QuickAction, type TrayGroupSpec } from './parts';
import { MyShift, OnShiftNow, roleDashboards, roleOrder, type RoleId } from './roles';
import { coverageTodayGroup } from './coverage-tray';

const unique = <T extends { id: string }>(items: T[]) => [...new Map(items.map(item => [item.id, item])).values()];

/**
 * W04, R4a (S2): Inicio is the «panel del día» for every role. In order: the critical notice (only when one exists),
 * then ONE pending tray with every group that waits on this account (S10 groups included), then the day's figures,
 * each datum once. A role adds only panels that are not a repeated number (agenda, turnaround, breakdowns).
 * An account with several roles gets one tray and one figure strip, merged without duplicates.
 */
export function Dashboard({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const roles = useMemo(() => roleOrder.filter(role => profile.roles.includes(role)), [profile.roles]);
  const needed = useMemo(() => {
    const set = new Set<Source>(roles.flatMap(role => roleDashboards[role].needs));
    set.add('followUps'); set.add('labPending');
    // An account with a staff record reads its own shifts; one without (ADM, JOP) reads who is on shift now.
    if (can(profile, 'turnos.ver')) { if (profile.staffId) set.add('myShifts'); else { set.add('shifts'); set.add('board'); } }
    return set;
  }, [roles, profile]);
  // R7 F3: every role that sees shifts gets «Mi turno» on Inicio; roles whose panels already show it keep theirs.
  const ownShiftPanel = can(profile, 'turnos.ver') && !roles.some(role => roleDashboards[role].needs.includes('myShifts'));
  const onShiftPanel = can(profile, 'turnos.ver') && !profile.staffId;
  const d = useDashboardData(api, profile, version, needed);
  if (roles.length === 0) return <>
    <CompactHeader breadcrumb="CLIMESA / Inicio" title="Inicio" />
    <CriticalNoticeBanner api={api} version={version} />
    {/* R1: one quiet line with the way out; no decorative card. */}
    <p className="section-empty" role="status"><strong>Tu función no tiene un tablero en la web</strong> · <a className="row-action" href="#/perfil">Ver mi cuenta</a></p>
  </>;
  const ctx = { d, profile };
  const groups: TrayGroupSpec[] = unique(roles.flatMap((role: RoleId) => roleDashboards[role].tray(ctx)));
  const figures: Figure[] = unique(roles.flatMap((role: RoleId) => roleDashboards[role].figures(ctx)));
  const actions: QuickAction[] = unique(roles.flatMap((role: RoleId) => roleDashboards[role].actions));
  const followUps = can(profile, 'citas.agendar'), results = can(profile, 'laboratorio.revisar');
  // The «Al día» line needs to know the S10 groups are empty too.
  const s10Clear = (!followUps || (!!d.followUps.data && d.followUps.data.length === 0)) && (!results || (!!d.labPending.data && d.labPending.data.length === 0));
  return <>
    <CompactHeader breadcrumb="CLIMESA / Inicio" title={roleDashboards[roles[0]].title} actions={<QuickActions actions={actions} profile={profile} />} />
    <CriticalNoticeBanner api={api} version={version} />
    <div className="day-panel">
      {/* S10: follow-up appointments proposed when results arrive (Recepción), and results for the doctor to review.
          They count toward the two open groups of the tray; beyond that they fold like any other group. */}
      <PendingTray groups={groups} othersClear={s10Clear} extras={[
        ...(followUps ? [{ id: 'seguimientos', title: 'Citas de seguimiento por confirmar', count: d.followUps.data ? d.followUps.data.length : null, node: <LabFollowUpPanel api={api} version={version} state={d.followUps} inTray /> }] : []),
        ...(results ? [{ id: 'por-revisar', title: 'Resultados por revisar', count: d.labPending.data ? d.labPending.data.length : null, node: <LabResultsInbox api={api} profile={profile} version={version} state={d.labPending} inTray /> }] : []),
      ]} />
      <DayFigures figures={figures} />
    </div>
    {onShiftPanel ? <div className="role-dashboard"><OnShiftNow shifts={d.shifts} gapsToday={groups.some(g => g.id === 'huecos') || !d.board.data?.cobertura ? null : coverageTodayGroup(d).items.length} /></div>
      : ownShiftPanel && <div className="role-dashboard"><MyShift shifts={d.myShifts} /></div>}
    {roles.map((role: RoleId) => { const panels = roleDashboards[role].panels?.(ctx); return panels ? <div className="role-dashboard" key={role}>{panels}</div> : null; })}
  </>;
}
