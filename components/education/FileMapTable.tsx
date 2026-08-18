import { FILE_MAP } from '@/lib/demo/guide-content';

export default function FileMapTable() {
  return (
    <table className="edu-table">
      <caption className="sr-only">Files to copy</caption>
      <thead>
        <tr>
          <th scope="col">File</th>
          <th scope="col">Role</th>
        </tr>
      </thead>
      <tbody>
        {FILE_MAP.map((row) => (
          <tr key={row.path}>
            <td>
              <code>{row.path}</code>
            </td>
            <td>{row.role}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
