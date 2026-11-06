'use client';

import type { MouseEvent, ReactNode } from 'react';

const DEMO_HREF = '/demo/overview';

function clearDemoSessionKeys() {
  try {
    window.sessionStorage.removeItem('teamup.workspace.view');
    window.sessionStorage.removeItem('teamup.demo.sessionActive');
    window.sessionStorage.removeItem('teamup.demo.workspaceOpened');
  } catch {
    // The demo link still works if browser storage is unavailable.
  }
}

export default function DemoLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  function openDemo(e: MouseEvent<HTMLAnchorElement>) {
    // Hard navigation avoids iOS Safari soft-nav quirks when a session cookie
    // is present (e.g. signed-in users opening demo from the landing page).
    e.preventDefault();
    clearDemoSessionKeys();
    window.location.assign(DEMO_HREF);
  }

  return (
    <a className={className} href={DEMO_HREF} onClick={openDemo}>
      {children}
    </a>
  );
}
