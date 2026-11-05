import { LANDING_ROUTES } from './routes';
import DemoLink from '../demo-link';

/** Simple footer links (same destinations as the hero CTAs). */
export function LandingFooter() {
  return (
    <footer className='landing-footer'>
      <a href={LANDING_ROUTES.signUp}>Create an account</a>
      <span aria-hidden='true'>·</span>
      <a href={LANDING_ROUTES.signIn}>Sign in</a>
      <span aria-hidden='true'>·</span>
      <DemoLink>Demo</DemoLink>
    </footer>
  );
}
