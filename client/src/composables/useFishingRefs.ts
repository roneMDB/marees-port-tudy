import { computed, ref } from 'vue';
import {
  addRef as apiAdd,
  deleteRef as apiDelete,
  getRefs,
  reorderRefs as apiReorder,
  resetRefs as apiReset,
  updateRef as apiUpdate
} from '../api/fishing';
import type { FishingRef, FishingRefKind } from '../types';

/**
 * Référentiels espèces/engins du carnet de pêche (issue #3), partagés (singleton) entre la vue
 * (libellés des prises, listes déroulantes du formulaire) et le panneau d'administration.
 */
const refs = ref<FishingRef[]>([]);
let loadPromise: Promise<void> | null = null;

/** Remet le singleton à zéro (tests uniquement). */
export function resetFishingRefsForTests(): void {
  refs.value = [];
  loadPromise = null;
}

export function useFishingRefs() {
  async function load(force = false): Promise<void> {
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
      try {
        refs.value = await getRefs();
      } catch {
        /* serveur indisponible : la vue affichera les ids bruts plutôt que rien */
      }
    })();
    return loadPromise;
  }

  const species = computed(() => refs.value.filter(r => r.kind === 'species'));
  const gears = computed(() => refs.value.filter(r => r.kind === 'gear'));

  /**
   * Libellé d'un référentiel. Repli sur l'**id brut** si l'entrée a disparu : une prise de 2026
   * doit rester lisible même après un nettoyage du référentiel.
   */
  function labelOf(id: string): string {
    return refs.value.find(r => r.id === id)?.label ?? id;
  }

  async function add(
    kind: FishingRefKind,
    label: string,
    labelPlural = '',
    defaultGearId: string | null = null
  ): Promise<void> {
    refs.value = [...refs.value, await apiAdd(kind, label, labelPlural, defaultGearId)];
  }

  async function update(
    id: string,
    label: string,
    labelPlural = '',
    defaultGearId: string | null = null
  ): Promise<void> {
    const updated = await apiUpdate(id, label, labelPlural, defaultGearId);
    refs.value = refs.value.map(r => (r.id === id ? updated : r));
  }

  async function remove(id: string): Promise<void> {
    await apiDelete(id);
    // Miroir du serveur : supprimer un engin remet à `null` le défaut des espèces qui le
    // désignaient, sinon `startEdit` préremplirait un sélecteur avec une option disparue.
    refs.value = refs.value
      .filter(r => r.id !== id)
      .map(r => (r.defaultGearId === id ? { ...r, defaultGearId: null } : r));
  }

  async function reset(): Promise<void> {
    refs.value = await apiReset();
  }

  /**
   * Réordonne une section. **Serveur d'abord**, comme les autres écritures d'ici : la réponse
   * devient l'état, donc rien à annuler si l'appel échoue (l'appelant affiche le message).
   */
  async function reorder(kind: FishingRefKind, ids: string[]): Promise<void> {
    refs.value = await apiReorder(kind, ids);
  }

  return { refs, species, gears, labelOf, load, add, update, remove, reorder, reset };
}
