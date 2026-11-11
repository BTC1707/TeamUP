/**
 * Legacy route: `/demo` → the Overview in guest/demo mode (no account).
 * Linked from the landing page “Try demo” button.
 */
import { redirect } from 'next/navigation';

export default function DemoPage() {
  redirect('/demo/overview');
}
