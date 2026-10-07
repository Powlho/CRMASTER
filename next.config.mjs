/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Active instrumentation.ts (tâche de maintenance : purge des audios expirés).
    instrumentationHook: true,
  },
};

export default nextConfig;
