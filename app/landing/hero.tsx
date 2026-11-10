import { ChevronDown } from 'lucide-react';
import { LANDING_ROUTES } from './routes';
import DemoLink from '../demo-link';

/** First screen: brand, headline, and main buttons. */
export function LandingHero({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className='landing-hero'>
      <div className='landing-hero-copy'>
        <p className='landing-brand'>
          teamup<span>.</span>
        </p>

        <h1>Your group, on the same page.</h1>

        <p className='landing-lede'>
          Plan tasks, find overlapping time, and keep assignment deadlines visible—without the
          group-chat chaos.
        </p>

        <div className='landing-cta-row'>
          {signedIn ? (
            <a className='btn primary' href={LANDING_ROUTES.workspace}>
              Open workspace
            </a>
          ) : (
            <>
              <a className='btn primary' href={LANDING_ROUTES.signUp}>
                Sign up
              </a>

              <a className='btn' href={LANDING_ROUTES.signIn}>
                Sign in
              </a>
            </>
          )}

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
