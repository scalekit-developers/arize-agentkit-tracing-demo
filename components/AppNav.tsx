import Link from 'next/link';
import { PHOENIX_UI_URL } from '@/lib/demo/guide-content';

type AppNavProps = {
  active: 'lab' | 'guide';
};

export default function AppNav({ active }: AppNavProps) {
  return (
    <header className="nav-term">
      <pre className="nav-term__line">
        <span className="prompt">&gt;</span>
        <span className="cmd">scalekit-arize-phoenix</span>{' '}
        <Link href="/" aria-current={active === 'lab' ? 'page' : undefined}>
          --lab
        </Link>{' '}
        <Link href="/guide" aria-current={active === 'guide' ? 'page' : undefined}>
          --guide
        </Link>{' '}
        <a href={PHOENIX_UI_URL} target="_blank" rel="noreferrer">
          --phoenix
        </a>
        <span className="caret" aria-hidden="true">
          ▮
        </span>
      </pre>
    </header>
  );
}
