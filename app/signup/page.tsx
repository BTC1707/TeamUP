/**
 * Sign up — if already signed in, skip account creation and open the workspace.
 */

import { redirect } from 'next/navigation';
import { getSessionUser, safeReturnPath } from '@/lib/auth';
import SignUpForm from './signup-form';

export const dynamic = 'force-dynamic';

type SignUpPageProps = {
  searchParams?: Promise<{ return_to?: string }> | { return_to?: string };
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await Promise.resolve(searchParams ?? {});
  const session = await getSessionUser().catch(() => null);
  if (session) {
    redirect(safeReturnPath(params.return_to));
  }
  return <SignUpForm />;
}
