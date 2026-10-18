import { RULES, type RuleBlock } from '../rulesData';

function Block({ b }: { b: RuleBlock }) {
  switch (b.kind) {
    case 'p':
      return <p className="rules-block">{b.text}</p>;
    case 'ul':
      return (
        <ul className="rules-ul">
          {b.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case 'note':
      return <p className="rules-note">{b.text}</p>;
    case 'table':
      return (
        <table className="rules-table">
          <thead>
            <tr>
              {b.head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, i) => (
              <tr key={i}>
                {row.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'qa':
      return (
        <div className="qa">
          <p className="qa-q">问：{b.q}</p>
          <p className="qa-a">答：{b.a}</p>
        </div>
      );
  }
}

export default function RulesContent() {
  return (
    <div className="rules">
      {RULES.map((sec) => (
        <section key={sec.id} className="rules-section">
          <h3 className="rules-title">{sec.title}</h3>
          {sec.blocks.map((b, i) => (
            <Block key={i} b={b} />
          ))}
        </section>
      ))}
    </div>
  );
}
