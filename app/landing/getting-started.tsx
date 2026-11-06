import { ChevronDown } from 'lucide-react';
import { LANDING_ROUTES } from './routes';
import DemoLink from '../demo-link';

/** A quick introduction to TeamUP for first-time visitors. */
export function LandingGettingStarted() {
  return (
    <section className='landing-start' id='getting-started'>
      <div className='landing-start-inner'>
        <div className='landing-start-heading'>
          <p className='landing-eyebrow'>GETTING STARTED</p>
          <h2>Set up your first TeamUP project.</h2>
          <p className='landing-start-intro'>
            A few quick steps will get your group ready to plan and work together.
          </p>
        </div>

        <ol className='landing-start-steps'>
          <li>
            <span className='landing-start-number' aria-hidden='true'>
              01
            </span>
            <h3>Sign up or try the demo</h3>
            <p>
              Create an account to save your projects, or open the demo to explore the workspace
              first.
            </p>
          </li>
          <li>
            <span className='landing-start-number' aria-hidden='true'>
              02
            </span>
            <h3>Create or join your group</h3>
            <p>
              In your workspace, create a project. To join one, open your teammate’s invite link and
              accept the invitation.
            </p>
          </li>
          <li>
            <span className='landing-start-number' aria-hidden='true'>
              03
            </span>
            <h3>Add your project details</h3>
            <p>
              Add tasks and milestones, share availability and files, then invite your teammates so
              you can coordinate in one place.
            </p>
          </li>
        </ol>

        <div className='landing-start-cta'>
          <a className='btn primary' href={LANDING_ROUTES.signUp}>
            Get started
          </a>
          <DemoLink className='btn'>Explore the demo</DemoLink>
        </div>
      </div>

      <a
        className='landing-scroll-cue'
        href='#faq'
        aria-label='Scroll to FAQ and account links'
      >
        <span>FAQ</span>
        <ChevronDown size={22} aria-hidden='true' />
      </a>
    </section>
  );
}
