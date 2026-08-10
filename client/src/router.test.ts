import { describe, expect, it } from 'vitest';
import router from './router';

describe('router', () => {
  it('expose la route du dashboard et celle du carnet de pêche', () => {
    const paths = router.getRoutes().map(r => r.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/peche');
  });

  it('nomme les routes pour que les liens ne dépendent pas des chemins', () => {
    expect(router.resolve({ name: 'fishing' }).path).toBe('/peche');
    expect(router.resolve({ name: 'dashboard' }).path).toBe('/');
  });

  it('renvoie une URL inconnue vers le dashboard plutôt que sur une page blanche', async () => {
    // `resolve()` ne suit pas les redirections (analyse statique) : seule une navigation réelle
    // (`push`) les applique, d'où la vérification sur `currentRoute` plutôt que sur `.matched`.
    await router.push('/nawak');
    expect(router.currentRoute.value.name).toBe('dashboard');
  });
});
