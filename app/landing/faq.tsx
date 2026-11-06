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
      'The project owner can email an invitation link from Project settings or add a teammate by email. Teammates should sign in with the same email address they were invited with.',
  },
  {
    question: 'Does TeamUP send reminders or push notifications?',
    answer:
      'Automatic deadline reminders are not connected yet. On deployments with email and/or push configured, teammates can receive invitation emails and Team-page nudges (browser notification and/or email). Enable browser notifications in account settings to get push nudges.',
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
