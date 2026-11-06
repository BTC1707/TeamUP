const questions = [
  {
    question: 'What can my team organize in TeamUP?',
    answer:
      'Create a shared project, break the work into tasks and milestones, and keep the team’s files and availability together.',
  },
  {
    question: 'Can I try TeamUP before creating an account?',
    answer:
      'Yes. Open the demo workspace to explore the planning tools. Demo changes are temporary and reset when you leave or reload.',
  },
  {
    question: 'How do teammates join a project?',
    answer:
      'The project owner can invite teammates from the Team area. Teammates should sign in using the email address the owner invited.',
  },
  {
    question: 'Does TeamUP send reminders or push notifications?',
    answer:
      'Automatic deadline reminders are not connected. On deployments with push configured, teammates can enable browser notifications in account settings and send nudges from the Team page.',
  },
];

export function LandingFaq() {
  return (
    <section className='landing-faq' id='faq' aria-labelledby='landing-faq-title'>
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
    </section>
  );
}
