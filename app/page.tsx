import { ailoGame } from '@/ailo.config';
import { StarterGame } from '@/components/game';

export default function HomePage() {
  return (
    <main className="shell">
      <header className="game-header">
        <p className="eyebrow">AILO Games</p>
        <h1>{ailoGame.title}</h1>
        <p>{ailoGame.description}</p>
      </header>

      <StarterGame />

      <p className="template-note">
        Template ready. Replace <code>components/game.tsx</code> with your game.
      </p>
    </main>
  );
}
