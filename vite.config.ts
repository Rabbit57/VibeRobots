import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import vinext from 'vinext';
import {
  ailoCloudflare,
  ailoGame,
  ailoProductionDomain,
  ailoWorkerName,
} from './ailo.config';

const isUnconfiguredTemplate = ailoGame.slug === 'change-me';

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      config: {
        account_id: ailoCloudflare.accountId,
        name: ailoWorkerName,
        main: 'vinext/server/fetch-handler',
        compatibility_date: '2026-09-08',
        compatibility_flags: ['nodejs_compat'],
        workers_dev: true,
        // A real game gets its production hostname automatically on deploy.
        // Keep the unconfigured template itself off ailocalops.com.
        routes: isUnconfiguredTemplate
          ? []
          : [{ pattern: ailoProductionDomain, custom_domain: true }],
      },
    }),
  ],
});
