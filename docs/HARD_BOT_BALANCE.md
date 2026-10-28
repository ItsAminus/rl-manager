# Hard-mode bot balance — 28 October 2026

Manager Career's Hard assignment pools:

| OVR | Requested pool |
|---|---|
| 99 | Kiyo3 |
| 98 | Chronos |
| 97 | BonkDaddy |
| 96 | Byte |
| 93–95 | OptiGP, Opti, RippleV1, London |
| 90–92 | NextoPlus, Ducky |
| 89 | AstraV5, Daizen, Zeus, OptiFR |
| 86–88 | AstraV5, Daizen, Zeus |
| 79–85 | Necto |

Below 79, Easy, Medium and Path To Glory tier definitions are unchanged. Multiple-policy pools are shuffled per series and locked by player identity. Existing healthy series locks are retained until the next series, rather than changing a policy midway through a series. Failed/unavailable policies recover down the strength ladder and disclose the replacement. A stronger policy is never substituted for a lower-rated player's missing bot.

## Availability matters

- London remains excluded by the existing known-failure safeguard. It is in the requested strength pool, but is not forced into a match while flagged as broken. Machine-specific quarantines are also respected.
- RippleV1 and RippleV1.1 now have distinct health identities. Exact RippleV1 selection does not resolve to V1.1. A V1.1 failure does not by itself exclude V1; a legacy machine-specific whole-family Ripple quarantine conservatively continues to exclude both.
- Necto's local policy is presented as Diamond. Rocket Host's advertised Necto is Champ; it cannot be replaced with a local Diamond policy inside a hosted lobby. Hosted previews and notices explicitly disclose this. The existing route rule remains: Hard matches with any player 84+ use Rocket Host; all-83-or-lower matches use local RLBot. Therefore the Diamond requirement for 79–85 is only fully achievable in local matches with the current host catalog.
- The human-controlled slot receives no bot. Actual catalog identifiers are validated before launch; previews do not claim a missing hosted version is available.

Validation covers all changed boundaries, OptiFR's 89-only eligibility, exact Ripple version matching, Necto disclosure, series locks, partial failures, next-strongest fallback, hosted identity/readiness and unchanged local progression. 67 relevant Python tests pass. No installer rebuild or GitHub push was performed.
