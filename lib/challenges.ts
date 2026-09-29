export const CHALLENGE_BUCKET = 'challenge-evidence';
export const metrics = { km: 'Kilómetros', minutes: 'Tiempo (minutos)', elevation: 'Desnivel positivo (metros)', outings: 'Salidas', habit: 'Hábitos / objetivos cumplidos' } as const;
export type Metric = keyof typeof metrics;
export type Challenge = { id: string; team_id: string; title: string; description: string; metric: Metric; target: number; collective_target: number | null; starts_on: string; ends_on: string; requires_approval: boolean; archived: boolean };
export type Participant = { challenge_id: string; user_id: string };
export type ChallengeEntry = { id: string; challenge_id: string; user_id: string; activity_on: string; amount: number; note: string; evidence_path: string | null; status: 'pending' | 'approved' | 'rejected'; review_note: string };
export function teamToday(timezone: string, now = new Date()) {
 const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
 return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
export function monthRange(today: string) {
 const [year, month] = today.split('-').map(Number);
 return { starts_on: `${today.slice(0,7)}-01`, ends_on: `${today.slice(0,7)}-${new Date(Date.UTC(year,month,0)).getUTCDate()}` };
}
export function challengePhase(c: Challenge, today: string) { return c.archived ? 'Archivado' : today < c.starts_on ? 'Próximamente' : today > c.ends_on ? 'Finalizado' : 'En marcha'; }
export function daysRemaining(c: Challenge, today: string) { return Math.max(0, Math.round((Date.parse(c.ends_on) - Date.parse(today))/86400000) + 1); }
export function amountLabel(value: number, metric: Metric) {
 return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(value)} ${{ km: 'km', minutes: 'min', elevation: 'm+', outings: 'salidas', habit: 'cumplimientos' }[metric]}`;
}
export function progress(c: Challenge, entries: ChallengeEntry[], userId?: string) {
 const own = entries.filter(e => e.challenge_id === c.id && (!userId || e.user_id === userId));
 const total = Math.round(own.filter(e => e.status === 'approved').reduce((sum,e) => sum + Number(e.amount),0)*100)/100;
 const pending = Math.round(own.filter(e => e.status === 'pending').reduce((sum,e) => sum + Number(e.amount),0)*100)/100;
 const target = Number(userId ? c.target : c.collective_target || c.target);
 return { total, pending, percent: Math.min(100,Math.floor(total/target*100)), complete: total >= target, target };
}
export function leaderboard(c: Challenge, participants: Participant[], entries: ChallengeEntry[]) {
 const rows = participants.filter(p => p.challenge_id === c.id).map(p => ({ userId: p.user_id, ...progress(c,entries,p.user_id) })).sort((a,b) => b.total-a.total || a.userId.localeCompare(b.userId));
 let rank = 0;
 return rows.map((row,i) => { if (!i || row.total !== rows[i-1].total) rank=i+1; return { ...row,rank }; });
}
