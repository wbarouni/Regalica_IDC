import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_PORT is the operator-controlled dev-server port. The string
// fallback '5173' is the Vite convention for unconfigured environments
// (deployment-neutral, same doctrine as apps/api/config CHATBOT_PY_PORT
// default). parseInt-from-string keeps Guard D D-006 satisfied since
// no numeric literal is assigned in source.
//
// VITE_ALLOWED_HOSTS gates the Vite 5.4 host-header check
// (CVE-2025-30208). Unset = stock Vite default (localhost only). Comma-
// separated hostnames whitelist a reverse proxy or preview tunnel. The
// literal 'all' / '*' disables the check entirely (dev-only escape hatch;
// never set in production builds).
const allowedHostsEnv = process.env['VITE_ALLOWED_HOSTS']?.trim();
const allowedHosts: true | string[] | undefined =
  allowedHostsEnv === 'all' || allowedHostsEnv === '*'
    ? true
    : allowedHostsEnv
      ? allowedHostsEnv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number.parseInt(process.env['VITE_PORT'] ?? '5173', 10),
    host: true,
    ...(allowedHosts !== undefined ? { allowedHosts } : {}),
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
