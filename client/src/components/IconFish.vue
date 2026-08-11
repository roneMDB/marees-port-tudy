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
 */
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.1"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    style="width: 1em; height: 1em; vertical-align: -0.125em"
  >
    <path d="M4.6 8Q9.9 1.2 15 8 9.9 14.8 4.6 8Z" />
    <path d="M4.6 8 1.1 4.2Q2.9 8 1.1 11.8Z" />
    <circle cx="11.6" cy="7.1" r=".62" fill="currentColor" stroke="none" />
  </svg>
</template>
