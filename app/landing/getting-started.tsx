import { LANDING_ROUTES } from './routes';

/** A quick introduction to TeamUP for first-time visitors. */
export function LandingGettingStarted() {
  return (
    <section className='landing-start' id='getting-started'>
      <div className='landing-start-heading'>
        <p className='landing-eyebrow'>GETTING STARTED</p>
        <h2>Bring your assignment and your teammates together.</h2>
        <p className='landing-start-intro'>
          Build a plan everyone can follow, then keep the details up to date as the work progresses.
        </p>
      </div>

      <ol className='landing-start-steps'>
        <li>
          <span className='landing-start-number' aria-hidden='true'>01</span>
          <h3>Create a project</h3>
          <p>Sign up to save your work, or explore the demo workspace first. Give your project a name and add its key dates.</p>
        </li>
        <li>
          <span className='landing-start-number' aria-hidden='true'>02</span>
          <h3>Invite your teammates</h3>
          <p>Bring classmates into the project with an invitation. Members share the same tasks, milestones, availability, and files.</p>
        </li>
        <li>
          <span className='landing-start-number' aria-hidden='true'>03</span>
          <h3>Plan and make progress</h3>
          <p>Break the assignment into tasks, assign owners and due dates, and track progress. Add availability to spot meeting times, and upload project files for the team.</p>
        </li>
      </ol>

      <div className='landing-start-cta'>
        <a className='btn primary' href={LANDING_ROUTES.signUp}>Get started</a>
        <a className='btn' href={LANDING_ROUTES.demo}>Explore the demo</a>
      </div>
    </section>
  );
}
