/**
 * Marketing landing page (route: `/`).
 *
 * Who edits what:
 * - Hero CTAs / Sign up + Sign in wiring → already set up
 * - About copy → app/landing/about.tsx
 * - Images → app/landing/visual.tsx (+ files in public/landing/; shown beside About)
 * - Sign in page look → app/signin/page.tsx
 *
 * Site map:
 *   /           → this landing page
 *   /signup     → create account (working)
 *   /signin     → sign in (working)
 *   /workspace/overview → main app after auth
 *   /demo/overview      → try the app without an account
 */

import { LandingAbout } from './landing/about';
import { LandingFaq } from './landing/faq';
import { LandingGettingStarted } from './landing/getting-started';
import { LandingHero } from './landing/hero';

export default function Landing() {
  return (
    <main className='landing-page'>
      <LandingHero />
      <LandingAbout />
      <LandingGettingStarted />
      <LandingFaq />
    </main>
  );
}
