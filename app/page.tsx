import { ailoGame } from '@/ailo.config';
import { VibeRobotsGame } from '@/components/game';

export default function HomePage() {
  return (
    <main className="app-shell">
      <VibeRobotsGame title={ailoGame.title} />
    </main>
  );
}
