import type { DB } from './index';

/**
 * Instantané météo d'une sortie (issue #3) : **figé à la création**, jamais recalculé. Contrairement
 * au contexte marée — donnée de référence, corrigeable, donc dérivée à l'affichage — la météo d'un
 * jour passé n'est pas reproductible.
 */
export interface TripWeather {
  tempMin: number | null;
  tempMax: number | null;
  windMax: number | null;
  windDir: number | null;
  weatherCode: number | null;
  seaTemperature: number | null;
}

export interface FishingCatch {
  speciesId: string;
  gearId: string;
  quantity: number;
  sizeCm: number | null;
  weightG: number | null;
  kept: boolean;
}

export interface FishingTrip {
  id: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  weather: TripWeather | null;
  catches: FishingCatch[];
  createdAt: string;
  updatedAt: string;
}

/** Champs saisis (l'id, les horodatages et la météo ne viennent jamais du client). */
export interface FishingTripInput {
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  catches: FishingCatch[];
}

interface TripRow {
  id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  weather: string | null;
  created_at: string;
  updated_at: string;
}

interface CatchRow {
  trip_id: number;
  species_id: string;
  gear_id: string;
  quantity: number;
  size_cm: number | null;
  weight_g: number | null;
  kept: number;
}

function parseWeather(raw: string | null): TripWeather | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TripWeather;
  } catch {
    return null; // instantané illisible : la sortie reste lisible, c'est elle la donnée
  }
}

function toCatch(row: CatchRow): FishingCatch {
  return {
    speciesId: row.species_id,
    gearId: row.gear_id,
    quantity: row.quantity,
    sizeCm: row.size_cm,
    weightG: row.weight_g,
    kept: row.kept === 1
  };
}

/** Attache leurs prises à des sorties déjà lues (une seule requête, quel que soit le nombre). */
function withCatches(db: DB, rows: TripRow[]): FishingTrip[] {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => '?').join(',');
  const catches = db
    .prepare(
      `SELECT trip_id, species_id, gear_id, quantity, size_cm, weight_g, kept
       FROM fishing_catches WHERE trip_id IN (${placeholders}) ORDER BY trip_id, sort_order, id`
    )
    .all(...rows.map(r => r.id)) as CatchRow[];

  const byTrip = new Map<number, FishingCatch[]>();
  for (const row of catches) {
    const list = byTrip.get(row.trip_id) ?? [];
    list.push(toCatch(row));
    byTrip.set(row.trip_id, list);
  }

  return rows.map(r => ({
    id: r.id,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    notes: r.notes,
    weather: parseWeather(r.weather),
    catches: byTrip.get(r.id) ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

/**
 * Sorties de la plus récente à la plus ancienne, sur une plage **inclusive** (bornes optionnelles).
 * Le tri secondaire sur l'id départage deux sorties du même jour dans leur ordre de saisie inverse.
 */
export function listTrips(db: DB, from?: string, to?: string): FishingTrip[] {
  const where: string[] = [];
  const params: string[] = [];
  if (from) {
    where.push('date >= ?');
    params.push(from);
  }
  if (to) {
    where.push('date <= ?');
    params.push(to);
  }
  const rows = db
    .prepare(
      `SELECT id, date, start_time, end_time, notes, weather, created_at, updated_at
       FROM fishing_trips ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY date DESC, id DESC`
    )
    .all(...params) as TripRow[];
  return withCatches(db, rows);
}

export function getTrip(db: DB, id: number): FishingTrip | null {
  const row = db
    .prepare(
      `SELECT id, date, start_time, end_time, notes, weather, created_at, updated_at
       FROM fishing_trips WHERE id = ?`
    )
    .get(id) as TripRow | undefined;
  return row ? withCatches(db, [row])[0] : null;
}

function insertCatches(db: DB, tripId: number, catches: FishingCatch[]): void {
  const ins = db.prepare(
    `INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity, size_cm, weight_g, kept, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  catches.forEach((c, i) =>
    ins.run(tripId, c.speciesId, c.gearId, c.quantity, c.sizeCm, c.weightG, c.kept ? 1 : 0, i)
  );
}

/** Crée une sortie et ses prises en une transaction. `weather` est figé ici, une fois pour toutes. */
export function createTrip(
  db: DB,
  input: FishingTripInput,
  weather: TripWeather | null,
  nowIso: string
): FishingTrip {
  const id = db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO fishing_trips (date, start_time, end_time, notes, weather, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.date,
        input.startTime,
        input.endTime,
        input.notes,
        weather ? JSON.stringify(weather) : null,
        nowIso,
        nowIso
      );
    const tripId = Number(res.lastInsertRowid);
    insertCatches(db, tripId, input.catches);
    return tripId;
  })();
  return getTrip(db, id)!;
}

/**
 * Remplace la sortie **et toutes ses prises** en une transaction : une sortie s'édite comme un
 * formulaire, d'un bloc. La colonne `weather` n'est **pas** touchée — la recapturer écraserait
 * la météo de juillet par un « — » le jour où l'on corrige une note en janvier.
 */
export function updateTrip(
  db: DB,
  id: number,
  input: FishingTripInput,
  nowIso: string
): FishingTrip | null {
  const exists = db.prepare('SELECT 1 FROM fishing_trips WHERE id = ?').get(id) != null;
  if (!exists) return null;
  db.transaction(() => {
    db.prepare(
      `UPDATE fishing_trips SET date = ?, start_time = ?, end_time = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    ).run(input.date, input.startTime, input.endTime, input.notes, nowIso, id);
    db.prepare('DELETE FROM fishing_catches WHERE trip_id = ?').run(id);
    insertCatches(db, id, input.catches);
  })();
  return getTrip(db, id);
}

/** Supprime une sortie ; ses prises partent avec (cascade **et** suppression explicite ci-dessus). */
export function deleteTrip(db: DB, id: number): boolean {
  return db.transaction(() => {
    db.prepare('DELETE FROM fishing_catches WHERE trip_id = ?').run(id);
    return db.prepare('DELETE FROM fishing_trips WHERE id = ?').run(id).changes > 0;
  })();
}
