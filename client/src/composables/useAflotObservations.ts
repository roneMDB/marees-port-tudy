import { reactive } from 'vue';
import {
  deleteObservation as apiDelete,
  getObservations,
  saveObservation as apiSave
} from '../api/aflotObservations';

/**
 * Heures de remise à flot **constatées** (issue #4), partagées (singleton) entre `useTides` (lecture
 * pour le champ `aflotObserved`) et `TideDayTable` (saisie admin). Clé = `${date} ${heure}` de la
 * basse mer **Port-Tudy** (`refDate` + `refTime`), car la remise à flot est toujours Navihan.
 */
const map = reactive<Record<string, string>>({});

function keyOf(date: string, time: string): string {
  return `${date} ${time}`;
}

/** (Re)charge les observations depuis le serveur. */
async function load(): Promise<void> {
  const list = await getObservations();
  for (const k of Object.keys(map)) delete map[k];
  for (const o of list) map[keyOf(o.date, o.time)] = o.observed;
}

export function useAflotObservations() {
  /** Heure constatée pour une basse mer Port-Tudy (`refDate`/`refTime`), ou `null`. Réactif. */
  function get(date?: string | null, time?: string | null): string | null {
    if (!date || !time) return null;
    return map[keyOf(date, time)] ?? null;
  }

  /** Enregistre/écrase l'heure constatée (admin), puis met à jour la map locale. */
  async function save(date: string, time: string, observed: string): Promise<void> {
    await apiSave({ date, time, observed });
    map[keyOf(date, time)] = observed;
  }

  /** Supprime l'observation (admin), puis met à jour la map locale. */
  async function remove(date: string, time: string): Promise<void> {
    await apiDelete(date, time);
    delete map[keyOf(date, time)];
  }

  return { map, load, get, save, remove };
}
