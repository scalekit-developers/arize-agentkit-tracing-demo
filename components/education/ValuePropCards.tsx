import { VALUE_PROPS } from '@/lib/demo/guide-content';

export default function ValuePropCards() {
  return (
    <div className="prop-grid">
      {VALUE_PROPS.map((prop) => (
        <article className="prop-card" key={prop.title}>
          <h3>{prop.title}</h3>
          <p>{prop.subtitle}</p>
          <ul>
            {prop.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
