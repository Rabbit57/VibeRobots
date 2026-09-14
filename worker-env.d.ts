interface CloudflareEnv {
  MATCH_ROOMS: DurableObjectNamespace<import('./worker/index').MatchRoom>;
}
