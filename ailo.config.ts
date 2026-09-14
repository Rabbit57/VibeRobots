export const ailoCloudflare = {
  // Cloudflare Account ID is an identifier, not a secret.
  // Set it once in the template so repositories created from it inherit the value.
  accountId: 'b6a9e7bbaeafb2b8098e1dff92e66ddb',
} as const;

export const ailoGame = {
  slug: 'vibe-robots',
  title: 'Vibe Robots',
  description:
    'Out-program your rivals in a dangerous online factory race for 2–8 players.',
} as const;

export const ailoWorkerName = `ailo-${ailoGame.slug}`;
export const ailoProductionDomain = `${ailoGame.slug}.ailocalops.com`;
