/**
 * Sign in — if a valid session cookie already exists (Remember me), skip the
 * form and go straight into the workspace.
 */

import { redirect } from 'next/navigation';
import { getSessionUser, safeReturnPath } from '@/lib/auth';
import SignInForm from './signin-form';

export const dynamic = 'force-dynamic';

type SignInPageProps = {
  searchParams?: Promise<{ return_to?: string }> | { return_to?: string };
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await Promise.resolve(searchParams ?? {});
  const session = await getSessionUser().catch(() => null);
  if (session) {
    redirect(safeReturnPath(params.return_to));
  }
  return <SignInForm />;
}
