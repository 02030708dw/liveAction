// src/modules/via/api/client.ts
import axios from 'axios';

export const viaRequest = axios.create({
    baseURL: 'https://www.j4r3b77.com/live-streamer-service/api/v1',
    timeout: 30000,
});


/**
 * 专门给 v2 下注用的 client
 * baseURL: .../live-streamer-service/api/v2
 */
export const viaOrderRequest = axios.create({
    baseURL: 'https://www.j4r3b77.com/live-streamer-service/api/v2',
    timeout: 10000,
});