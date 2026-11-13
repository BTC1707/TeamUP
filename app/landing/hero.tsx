import { ChevronDown } from 'lucide-react';
import { LANDING_ROUTES } from './routes';
import DemoLink from '../demo-link';

/** First screen: brand, headline, and main buttons. */
export function LandingHero() {
  return (
    <section className='landing-hero'>
      <div className='landing-hero-copy'>
        <p className='landing-brand'>
          TeamUP<span>.</span>
        </p>

        <h1>Plan group projects from first idea to final deadline.</h1>

        <p className='landing-lede'>
          TeamUP is a shared workspace for student teams. Turn an assignment into tasks, assign who
          is doing what, track milestones, and find time to meet—all in one place.
        </p>

        <div className='landing-cta-row'>
          <a className='btn primary' href={LANDING_ROUTES.signUp}>
            Sign up
          </a>

          <a className='btn' href={LANDING_ROUTES.signIn}>
            Sign in
          </a>

          <DemoLink className='btn subtle'>Try demo</DemoLink>
        </div>
      </div>

      <a className='landing-scroll-cue' href='#about' aria-label='Scroll to About Us'>
        <span>About us</span>
        <ChevronDown size={22} aria-hidden='true' />
      </a>
    </section>
  );
}
