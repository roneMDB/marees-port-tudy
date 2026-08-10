import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './assets/app.css';

import { Chart, registerables } from 'chart.js';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

// Enregistrement global des éléments Chart.js utilisés par les graphiques.
Chart.register(...registerables);

createApp(App).use(router).mount('#app');
