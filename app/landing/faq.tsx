import { LandingFooter } from './footer';

const questions = [
  {
    question: 'What can my team organize in TeamUP?',
    answer:
      'Create a shared project, break the work into tasks and milestones, and keep the team’s files and availability together.',
  },
  {
    question: 'Can I try TeamUP before creating an account?',
    answer: 'Yes. You can open the demo workspace to explore the application and try it.',
  },
  {
    question: 'How do teammates join a project?',
    answer:
      'The project owner can search for a teammate by name, email, or username and send an invite. It shows up in their notifications, where they can accept or decline.',
  },
  {
    question: 'Does TeamUP send reminders?',
    answer:
      'Teammates can get invitation emails, in-app updates, and nudges from the Team page.',
  },
];

/** Final landing viewport: FAQ plus account / sign-in / demo footer. */
export function LandingFaq() {
  return (
    <section className='landing-faq' id='faq' aria-labelledby='landing-faq-title'>
      <div className='landing-faq-body'>
        <div className='landing-faq-heading'>
          <p className='landing-eyebrow'>FAQ</p>
          <h2 id='landing-faq-title'>Questions, answered</h2>
          <p>Quick answers to help your group get started.</p>
        </div>
        <div className='landing-faq-list'>
          {questions.map(({ question, answer }) => (
            <details className='landing-faq-item' key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
      <LandingFooter />
    </section>
  );
}
