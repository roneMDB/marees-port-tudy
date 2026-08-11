<script setup lang="ts">
/**
 * Icône « poisson » — **SVG inline**, faute de glyphe : bootstrap-icons 1.13 n'a ni poisson ni
 * crabe parmi ses 2078 icônes. Un emoji 🐟 aurait fait l'affaire mais s'affiche **en couleur**,
 * seul de son espèce parmi les glyphes blancs de la navbar ; `currentColor` suit au contraire la
 * teinte du bouton, thème clair comme sombre.
 *
 * Dessinée **en contour** (`stroke`, pas `fill`) : les icônes bootstrap non suffixées `-fill` le
 * sont toutes, et une silhouette pleine pesait visiblement plus lourd que ses voisines dans la
 * rangée de la navbar. Corps et queue sont deux tracés distincts partageant le point de jonction.
 *
 * ⚠️ Le SVG est **enveloppé dans un `<i>`**, ce qui n'est pas décoratif. Les boutons de la navbar
 * sont en `d-inline-flex` : leur icône y est un **élément flex**, dont la hauteur est celle de sa
 * propre boîte — 1 em (14 px en `btn-sm`) pour un SVG nu, contre l'**interligne** (21 px) pour un
 * glyphe, d'où un bouton plus court de 7 px que ses voisins. Un `vertical-align` n'y peut rien, il
 * est sans effet sur un élément flex. L'enveloppe rétablit la géométrie d'un glyphe : c'est sa
 * ligne de texte qui donne la hauteur. Forcer plutôt `height: 1.5em` sur le SVG réparerait le
 * bouton mais **grandirait** l'entrée du menu ⋮, où l'icône est en ligne avec du texte (mesuré :
 * 32,6 px contre 32). Ici les deux contextes tombent au pixel près sur ceux d'un `bi-*`.
 */
</script>

<template>
  <i class="icon-fish">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.1"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.6 8Q9.9 1.2 15 8 9.9 14.8 4.6 8Z" />
      <path d="M4.6 8 1.1 4.2Q2.9 8 1.1 11.8Z" />
      <circle cx="11.6" cy="7.1" r=".62" fill="currentColor" stroke="none" />
    </svg>
  </i>
</template>

<style scoped>
.icon-fish {
  display: inline-block;
}

.icon-fish svg {
  width: 1em;
  height: 1em;
  /* Même décalage que le `::before` des glyphes bootstrap-icons. */
  vertical-align: -0.125em;
}
</style>
