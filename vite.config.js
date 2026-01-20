import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// https://vitejs.dev/config/
export default defineConfig(function (_a) {
    var mode = _a.mode;
    return ({
        plugins: [react()],
        base: mode === 'production' ? '/DropFile/' : '/',
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        server: {
            port: 9002,
            host: true, // Expose on all network interfaces (0.0.0.0)
        },
    });
});
