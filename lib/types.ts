export type Role = 'admin' | 'coach' | 'member';
export type Profile = { id: string; display_name: string };
export type Team = { id: string; name: string; timezone: string };
export type Membership = { team_id: string; user_id: string; role: Role };
export type RemovedMember = { user_id: string; display_name: string; removed_at: string };
export type Training = {
  id: string; team_id: string; title: string; starts_at: string; place: string;
  km: number; gain: number; duration: number; level: string; description: string; gear: string;
};
export type Route = { training_id: string; team_id: string; path: string; filename: string };
export type Attendance = { training_id: string; team_id: string; user_id: string };
