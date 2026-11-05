import type { ReactNode } from 'react';
import Workspace from '../workspace';

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Workspace demoMode />
      {children}
    </>
  );
}
