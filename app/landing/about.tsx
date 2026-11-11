/** About section — copy lives in the body paragraph below. */
import { ChevronDown } from 'lucide-react';
import { LandingVisual } from './visual';

export function LandingAbout() {
  return (
    <section className='landing-about' id='about'>
      <div className='landing-about-row'>
        <div className='landing-about-copy'>
          <p className='landing-eyebrow'>ABOUT US</p>

          <h2>Everything your project group needs to keep moving</h2>

          <p className='landing-about-body'>
            Start a project, invite classmates, and turn the assignment into a shared plan. Create
            tasks with owners, due dates, and progress; group them under milestones so the team can
            see what is coming up and what is complete. Teammates can add their availability to find
            overlapping hours, and keep project files alongside the work. When you need a starting
            point, optional AI planning can suggest tasks and milestones from an assignment brief.
            Your team can review and edit the suggestions before adding them to the project.
          </p>
        </div>

        <LandingVisual />
      </div>

      <a
        className='landing-scroll-cue'
        href='#getting-started'
        aria-label='Scroll to Getting Started'
      >
        <span>Getting started</span>
        <ChevronDown size={22} aria-hidden='true' />
      </a>
    </section>
  );
}
