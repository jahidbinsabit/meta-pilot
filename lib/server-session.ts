import { auth } from '@/lib/auth-handler';

/**
 * next-auth v5 has no `getServerSession` export. `auth()` (returned by
 * `NextAuth(config)`) is the v5 equivalent for server components and route
 * handlers. This wrapper keeps call sites identical to the v4 API.
 */
async function getServerSession() {
  return auth();
}

export default getServerSession;
