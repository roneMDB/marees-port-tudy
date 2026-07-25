import type { DB } from './index';

/** Heure de remise à flot **constatée** pour une basse mer Port-Tudy (date + heure). Issue #4. */
export interface AflotObservation {
  date: string; // date de la basse mer Port-Tudy (YYYY-MM-DD)
  time: string; // heure de la basse mer Port-Tudy (HH:MM) — identifie la marée
  observed: string; // heure réellement constatée (HH:MM)
}

/** Toutes les observations, triées par date puis heure. */
export function getObservations(db: DB): AflotObservation[] {
  return db
    .prepare('SELECT date, time, observed FROM aflot_observations ORDER BY date, time')
    .all() as AflotObservation[];
}

/** Enregistre (ou met à jour) l'heure constatée d'une basse mer (clé `date` + `time`). */
export function upsertObservation(db: DB, obs: AflotObservation): void {
  db.prepare(
    `INSERT INTO aflot_observations (date, time, observed, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(date, time) DO UPDATE SET observed = excluded.observed, updated_at = datetime('now')`
  ).run(obs.date, obs.time, obs.observed);
}

/** Supprime l'observation d'une basse mer. */
export function deleteObservation(db: DB, date: string, time: string): void {
  db.prepare('DELETE FROM aflot_observations WHERE date = ? AND time = ?').run(date, time);
}
