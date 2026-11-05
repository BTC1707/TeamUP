/**
 * Legacy route: `/workspace` → the Overview page.
 *
 * On localhost this opens an interactive in-memory sandbox (no Cloudflare DB).
 * On the live site it uses signed-in accounts + D1.
 */
import { redirect } from 'next/navigation';

export default function WorkspacePage() {
  redirect('/workspace/overview');
}
