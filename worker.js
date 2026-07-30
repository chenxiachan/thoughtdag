// Cloudflare Workers entry (Workers + static assets deployment).
// The API logic lives in functions/api/[[path]].js so the SAME file also
// works as a Pages Function — this wrapper just adapts the routing:
// /api/* → the stateless proxy, everything else → the built static app.
import { onRequest } from './functions/api/[[path]].js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/story' || url.pathname.startsWith('/story/')) {
      const suffix = url.pathname.replace(/^\/story\/?/, '');
      const target = new URL(`https://chenxiachan.github.io/thoughtdag/${suffix}`);
      target.search = url.search;
      return Response.redirect(target.toString(), 301);
    }
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice('/api/'.length);
      return onRequest({ request, params: { path: path.split('/') }, env });
    }
    return env.ASSETS.fetch(request);
  },
};
