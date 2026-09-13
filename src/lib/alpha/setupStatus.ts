import { envVarNameFor } from "./secrets";

/** Single source of truth for "which Alpha credential is this, and where do
 *  I get one" — read by `service.getHealth` (surfaced on `/alpha`'s needs-
 *  setup panel and the `get_health` MCP tool) and mirrored in
 *  `docs/alpha/STATUS.md`'s "Needs Aise" list. Keeping the URLs here instead
 *  of duplicated in both places is the point: STATUS.md's list is generated
 *  from this file's shape when the doc is next updated, not hand-typed
 *  twice. `zoqo-terminal`/`zoqo-predict`/`zoqo-sportsbook`/`polymarket-sim`
 *  need no external credential (paper/simulated or public-read) and are
 *  intentionally absent — nothing to configure, nothing to report. */

export interface CredentialRequirement {
  /** venue id or provider name, matching `alpha_rate_budget.provider` /
   *  `VenueId` where applicable — not always a `VenueId` (football data
   *  providers aren't venues). */
  id: string;
  label: string;
  kind: "venue" | "provider";
  envVar: string;
  signupUrl: string;
}

export const CREDENTIAL_REQUIREMENTS: CredentialRequirement[] = [
  { id: "manifold", label: "Manifold", kind: "venue", envVar: envVarNameFor("manifold"), signupUrl: "https://manifold.markets/" },
  { id: "kalshi-demo", label: "Kalshi (demo)", kind: "venue", envVar: envVarNameFor("kalshi-demo"), signupUrl: "https://demo.kalshi.co" },
  { id: "bybit-demo", label: "Bybit (demo)", kind: "venue", envVar: envVarNameFor("bybit-demo"), signupUrl: "https://api-demo.bybit.com" },
  { id: "deriv-virtual", label: "Deriv (virtual)", kind: "venue", envVar: envVarNameFor("deriv-virtual"), signupUrl: "https://developers.deriv.com/" },
  { id: "api-football", label: "API-Football (fixtures + odds)", kind: "provider", envVar: "API_FOOTBALL_KEY", signupUrl: "https://www.api-football.com/" },
  { id: "the-odds-api", label: "The Odds API (optional closing-line backup)", kind: "provider", envVar: "THE_ODDS_API_KEY", signupUrl: "https://the-odds-api.com/" },
];

export interface CredentialStatus extends CredentialRequirement {
  configured: boolean;
}

/** Server-only — reads `process.env` directly rather than going through
 *  `getVenueSecret` (which is per-user/Vault-aware) because this reports
 *  presence for the setup UI, never the secret value itself. */
export function getCredentialStatus(): CredentialStatus[] {
  return CREDENTIAL_REQUIREMENTS.map((req) => ({ ...req, configured: !!process.env[req.envVar] }));
}
