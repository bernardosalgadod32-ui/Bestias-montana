'use client';
import type { Membership, RemovedMember, Role } from '../lib/types';

type Props = {
  members: Membership[];
  removed: RemovedMember[];
  userId: string;
  role: Role | undefined;
  busy: boolean;
  nameOf: (id: string) => string;
  onRoleChange: (memberId: string, role: Role) => void;
  onRemove: (member: Membership) => void;
  onReadmit: (member: RemovedMember) => void;
};

export default function TeamMembers({ members, removed, userId, role, busy, nameOf, onRoleChange, onRemove, onReadmit }: Props) {
  return <>
    <div className="stack">{members.map(member => {
      const name = nameOf(member.user_id);
      return <div className="member" key={member.user_id}>
        <div className="member-name"><b>{name}{member.user_id === userId ? ' (tú)' : ''}</b><small>{member.role}</small></div>
        {role === 'admin' && <div className="member-actions">
          <select aria-label={`Rol de ${name}`} value={member.role} disabled={busy} onChange={event => onRoleChange(member.user_id, event.target.value as Role)}>
            {(['member', 'coach', 'admin'] as const).map(value => <option key={value}>{value}</option>)}
          </select>
          {member.user_id !== userId && <button type="button" className="secondary" disabled={busy} aria-label={`Sacar a ${name} del equipo`} onClick={() => onRemove(member)}>Sacar del equipo</button>}
        </div>}
      </div>;
    })}</div>
    {role === 'admin' && <p className="muted">Al sacar a alguien pierde el acceso al equipo y sus confirmaciones de asistencia. Su cuenta se conserva; solo un administrador puede readmitirlo.</p>}
    {role === 'admin' && removed.length > 0 && <section aria-labelledby="removed-members-title" className="removed-members">
      <h3 id="removed-members-title">Fuera del equipo</h3>
      <p className="muted">Estas personas no pueden volver con un código de invitación. Puedes readmitirlas como miembros; tendrán que confirmar de nuevo su asistencia.</p>
      <div className="stack">{removed.map(member => <div className="member" key={member.user_id}>
        <div className="member-name"><b>{member.display_name}</b><small>Sin acceso</small></div>
        <div className="member-actions"><button type="button" className="secondary" disabled={busy} aria-label={`Readmitir a ${member.display_name} como miembro`} onClick={() => onReadmit(member)}>Readmitir como miembro</button></div>
      </div>)}</div>
    </section>}
  </>;
}
