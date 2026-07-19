import { DEFAULT_OFFSETS } from '../lib/navihan';
import { useSettings } from './useSettings';

/**
 * Décalages Navihan, adossés à la configuration serveur (`settings.navihan`).
 * Toute modification est persistée via la sauvegarde auto de `useSettings`.
 */
export function useNavihan() {
  const { settings } = useSettings();

  function reset(): void {
    settings.navihan.basseMer = DEFAULT_OFFSETS.basseMer;
    settings.navihan.pleineMer = DEFAULT_OFFSETS.pleineMer;
    settings.navihan.aFlot = DEFAULT_OFFSETS.aFlot;
  }

  return { offsets: settings.navihan, reset };
}
