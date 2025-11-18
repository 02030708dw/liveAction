// src/modules/via/api/client.ts
import axios from 'axios';

export const viaRequest = axios.create({
    baseURL: 'https://www.j4r3b77.com/live-streamer-service/api/v1',
    timeout: 10000,
});
