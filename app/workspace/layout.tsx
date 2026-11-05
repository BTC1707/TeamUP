import type { ReactNode } from 'react';
import Workspace from '../workspace';
import { getSessionUser } from '@/lib/auth';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const sessionUser = await getSessionUser().catch(() => null);
  const initialLocalAdmin = sessionUser?.email === 'admin@teamup.local';

  return (
    <>
      <Workspace initialLocalAdmin={initialLocalAdmin} />
      {children}
    </>
  );
}
