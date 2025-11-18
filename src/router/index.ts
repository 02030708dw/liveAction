import { createRouter, createWebHistory } from 'vue-router';
import DG from '@/views/DG/home.vue';

const routes = [
    {
        path: '/',
        name: 'DGHome',
        component: DG,
    },
    {
        path: '/test',
        name: 'test',
        component: () => import('@/views/test/index.vue'),
    },
    {
        path: '/via',
        name: 'via',
        component: () => import('@/views/VIA/index.vue'),
    }
];

export default createRouter({
    history: createWebHistory(),
    routes,
});
