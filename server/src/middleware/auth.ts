import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Authentification HTTP Basic **optionnelle**, pour protéger l'app lorsqu'elle est exposée à
 * l'extérieur (reverse proxy NAS). Activée uniquement si la variable d'environnement
 * `APP_PASSWORD` est renseignée ; sinon le middleware laisse tout passer (développement local et
 * tests inchangés). Identifiant : `APP_USER` (défaut `marees`). `/api/health` reste public (sonde
 * Docker / supervision).
 */
export function basicAuth() {
  const user = process.env.APP_USER || 'marees';
  const password = process.env.APP_PASSWORD || '';
  const enabled = password.length > 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled || req.path === '/api/health') {
      return next();
    }

    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      const u = sep >= 0 ? decoded.slice(0, sep) : '';
      const p = sep >= 0 ? decoded.slice(sep + 1) : '';
      if (safeEqual(u, user) && safeEqual(p, password)) {
        return next();
      }
    }

    res.set('WWW-Authenticate', 'Basic realm="Marées Navihan", charset="UTF-8"');
    res.status(401).json({ error: 'Authentification requise.' });
  };
}

/** Comparaison à temps constant (le test de longueur ne fuit qu'une info négligeable). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
