import { createRouter, createWebHistory } from 'vue-router';
import Dashboard from './views/Dashboard.vue';

/**
 * Routeur de l'application (issue #3). L'app était mono-vue ; le carnet de pêche justifie une
 * seconde page plein écran plutôt qu'un offcanvas de plus. Historique HTML5 : le repli SPA existe
 * déjà côté Express (`app.get('*')`) et côté PWA (`navigateFallback`).
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: Dashboard },
    // Chargée à la demande : le carnet n'est pas nécessaire pour afficher les marées.
    { path: '/peche', name: 'fishing', component: () => import('./views/FishingView.vue') },
    // Une URL inconnue (ancien favori, faute de frappe) revient au dashboard, pas sur du vide.
    // Redirection par **chemin** et non par nom : vers une route nommée, Vue Router tenterait de
    // lui transmettre le `pathMatch` capturé ici et avertirait « Discarded invalid param(s) ».
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
});

export default router;
