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
      'The project owner can email an invitation link from Project settings or add a teammate by email. Teammates should sign in with the same email address they were invited with.',
  },
  {
    question: 'Does TeamUP send reminders or push notifications?',
    answer:
      'Yes. Teammates can get invitation emails, in-app updates, and optional browser or email nudges from the Team page so everyone stays in the loop.',
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
