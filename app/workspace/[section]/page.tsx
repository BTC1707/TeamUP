import { notFound } from 'next/navigation';
import { isWorkspacePath } from '@/lib/workspace-routes';

export default async function WorkspaceSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isWorkspacePath(section)) notFound();
  return null;
}
