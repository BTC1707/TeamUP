/** About section — copy lives in the body paragraph below. */
import { ChevronDown } from 'lucide-react';
import { LandingVisual } from './visual';

export function LandingAbout() {
  return (
    <section className='landing-about' id='about'>
      <div className='landing-about-row'>
        <div className='landing-about-copy'>
          <p className='landing-eyebrow'>ABOUT US</p>

          <h2>Built for student project groups</h2>

          <p className='landing-about-body'>
            Group projects are easier when everyone knows what needs to happen next. TeamUP gives
            classmates one shared place to organize tasks, track milestones, coordinate availability,
            and keep project files together. With AI-assisted planning to help teams get unstuck, TeamUP
            makes it easier to stay organized and move forward together.
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
