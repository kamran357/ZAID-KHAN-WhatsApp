import type { NextConfig } from 'next';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

/** Fail loudly at build time on Vercel instead of shipping a dashboard without a backend. */
if (process.env.VERCEL && !process.env.API_PROXY_TARGET) {
  console.warn(
    '[zk] API_PROXY_TARGET is not set. /api and /socket.io will point at http://localhost:4000 and every request will fail. Set it in Vercel → Settings → Environment Variables, then redeploy.',
  );
}

/**
 * The dashboard is a pure client of the API server: /api and /socket.io are
 * proxied so the session cookie stays first-party (no CORS, no leaked origin).
 * DEV_ORIGIN allows the cloud preview hostname through Next's dev origin check.
 */
const devOrigin = process.env.DEV_ORIGIN;

const nextConfig: NextConfig = {
  ...(devOrigin ? { allowedDevOrigins: [devOrigin] } : {}),
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiTarget}/api/:path*` },
      { source: '/socket.io/:path*', destination: `${apiTarget}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
