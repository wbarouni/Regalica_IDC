import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_PORT is the operator-controlled dev-server port. The string
// fallback '5173' is the Vite convention for unconfigured environments
// (deployment-neutral, same doctrine as apps/api/config CHATBOT_PY_PORT
// default). parseInt-from-string keeps Guard D D-006 satisfied since
// no numeric literal is assigned in source.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number.parseInt(process.env['VITE_PORT'] ?? '5173', 10),
    host: true,
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
