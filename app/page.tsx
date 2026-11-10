/**
 * Route: `/` → marketing landing page.
 * The interactive app lives under `/workspace/[section]` (see app/workspace/[section]/page.tsx).
 */
import { getSessionUser } from '@/lib/auth';
import Landing from './landing';

/** Cookie-aware CTAs — must not be statically cached. */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSessionUser().catch(() => null);
  return <Landing signedIn={Boolean(session)} />;
}
