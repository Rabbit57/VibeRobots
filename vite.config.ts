import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import vinext from 'vinext';
import {
  ailoCloudflare,
  ailoProductionDomain,
  ailoWorkerName,
} from './ailo.config';

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      config: {
        account_id: ailoCloudflare.accountId,
        name: ailoWorkerName,
        main: './worker/index.ts',
        compatibility_date: '2026-05-22',
        compatibility_flags: ['nodejs_compat'],
        workers_dev: true,
        routes: [{ pattern: ailoProductionDomain, custom_domain: true }],
        durable_objects: {
          bindings: [{ name: 'MATCH_ROOMS', class_name: 'MatchRoom' }],
        },
        migrations: [{ tag: 'v1', new_sqlite_classes: ['MatchRoom'] }],
      },
    }),
  ],
});
