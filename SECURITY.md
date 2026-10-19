# Security policy

Pilot Light protects information about medically dependent people: where they live, what keeps them alive, and how to get into their homes. We take reports seriously.

## Reporting a vulnerability

Email **security@pilotlight.app** (or the maintainers listed in the repository) with a description and steps to reproduce. Please don't open a public issue, and don't access, change or delete other people's data while testing.

We will acknowledge a report within 3 days, keep you updated, and credit you (if you want) once it's fixed.

## Scope

The web app, its API (`/api/*`), the iOS app, and the power-module reporting endpoint. Out of scope: denial-of-service, social engineering, and third-party services (Vercel, Twilio, the database host).

See [docs/security](docs/security/README.md) for how the system is protected.
