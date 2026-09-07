const enabled = import.meta.env.DEV;

const PUUID_LOG_PREFIX = 8;

export function maskPuuid(puuid) {
  return `${String(puuid).slice(0, PUUID_LOG_PREFIX)}…`;
}

export function debug(...args) {
  if (enabled) console.log(...args);
}

export function debugLazy(build) {
  if (enabled) console.log(...[].concat(build()));
}
