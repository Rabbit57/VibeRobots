import {
  ailoCloudflare,
  ailoGame,
  ailoProductionDomain,
  ailoWorkerName,
} from '../ailo.config.ts';

const errors = [];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const accountIdPattern = /^[a-f0-9]{32}$/i;

if (ailoCloudflare.accountId === 'CHANGE_ME_CLOUDFLARE_ACCOUNT_ID') {
  errors.push('Set ailoCloudflare.accountId in ailo.config.ts before production deployment.');
}
if (!accountIdPattern.test(ailoCloudflare.accountId)) {
  errors.push('Cloudflare Account ID should be a 32-character hexadecimal identifier.');
}
if (ailoGame.slug === 'change-me') {
  errors.push('Set ailoGame.slug in ailo.config.ts before production deployment.');
}
if (!slugPattern.test(ailoGame.slug)) {
  errors.push('Slug must contain lowercase letters/numbers separated by single hyphens.');
}
if (!ailoGame.title.trim()) errors.push('Game title cannot be empty.');
if (!ailoGame.description.trim()) errors.push('Game description cannot be empty.');

if (errors.length) {
  console.error('AILO game configuration is not ready:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Worker: ${ailoWorkerName}`);
console.log(`Domain: https://${ailoProductionDomain}`);
console.log(`Cloudflare account: ${ailoCloudflare.accountId}`);
