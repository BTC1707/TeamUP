'use client';

import type { ReactNode } from 'react';

export default function DemoLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      className={className}
      href='/demo'
      onClick={() => {
        try {
          window.sessionStorage.removeItem('teamup.workspace.view');
          window.sessionStorage.removeItem('teamup.demo.sessionActive');
        } catch {
          // The demo link still works if browser storage is unavailable.
        }
      }}
    >
      {children}
    </a>
  );
}
