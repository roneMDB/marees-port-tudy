import { ref } from 'vue';
import {
  createTrip,
  deleteTrip,
  getTrips,
  updateTrip
} from '../api/fishing';
import type { FishingTrip, FishingTripInput } from '../types';

/**
 * Sorties de pêche (issue #3), partagées (singleton). La liste arrive **déjà triée** de la plus
 * récente à la plus ancienne par le serveur ; on la maintient dans cet ordre à l'écriture.
 */
const trips = ref<FishingTrip[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let loadPromise: Promise<void> | null = null;

/** Remet le singleton à zéro (tests uniquement). */
export function resetFishingForTests(): void {
  trips.value = [];
  loading.value = false;
  error.value = null;
  loadPromise = null;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Réinsère une sortie à sa place (tri décroissant sur la date, puis sur l'id). */
function sortTrips(list: FishingTrip[]): FishingTrip[] {
  return [...list].sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)));
}

export function useFishing() {
  async function load(force = false): Promise<void> {
    if (loadPromise && !force) return loadPromise;
    loading.value = true;
    error.value = null;
    loadPromise = (async () => {
      try {
        trips.value = await getTrips();
      } catch (e) {
        error.value = message(e);
      } finally {
        loading.value = false;
      }
    })();
    return loadPromise;
  }

  /** Crée (`id` absent) ou remplace (`id` fourni) une sortie, puis met la liste à jour. */
  async function save(input: FishingTripInput, id?: number): Promise<FishingTrip> {
    const saved = id == null ? await createTrip(input) : await updateTrip(id, input);
    trips.value = sortTrips(
      id == null ? [saved, ...trips.value] : trips.value.map(t => (t.id === id ? saved : t))
    );
    return saved;
  }

  async function remove(id: number): Promise<void> {
    await deleteTrip(id);
    trips.value = trips.value.filter(t => t.id !== id);
  }

  return { trips, loading, error, load, save, remove };
}
