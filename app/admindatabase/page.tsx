export const metadata = {
  title: 'User database · TeamUP',
  robots: { index: false, follow: false },
};

const sampleUsers = [
  { name: 'Jordan Lee', email: 'jordan.lee@example.test', projectsCreated: 3 },
  { name: 'Casey Rivera', email: 'casey.rivera@example.test', projectsCreated: 1 },
  { name: 'Taylor Brooks', email: 'taylor.brooks@example.test', projectsCreated: 0 },
];

export default function AdminDatabasePage() {
  return (
    <main className='admin-page admin-database-page'>
      <header className='admin-database-header'>
        <h1>User database</h1>
        <p>Sample data for layout preview. These rows are placeholders, not live account data.</p>
      </header>

      <div className='admin-database-table-wrap'>
        <table className='admin-database-table'>
          <thead>
            <tr>
              <th scope='col'>Name</th>
              <th scope='col'>Email</th>
              <th scope='col'>Projects created</th>
            </tr>
          </thead>
          <tbody>
            {sampleUsers.map((user) => (
              <tr key={user.email}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.projectsCreated.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
