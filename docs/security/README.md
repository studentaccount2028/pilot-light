# Pilot Light security documentation

| Document | For | What it covers |
|---|---|---|
| [overview.md](overview.md) | Fire department IT, partners, grant reviewers | How Pilot Light protects residents' information, in plain terms |
| [data-flow.md](data-flow.md) | IT reviewers | What data exists, where it flows, who can see it |
| [threat-model.md](threat-model.md) | Engineers, reviewers | What could go wrong, and what stops it |
| [questionnaire.md](questionnaire.md) | Department procurement / IT | Answers to a standard vendor security questionnaire |
| [incident-response.md](incident-response.md) | The team, partners | What happens if something goes wrong |
| [accepted-risks.md](accepted-risks.md) | Reviewers | Known limitations, why they're acceptable now, and the plan |
| [deployment-checklist.md](deployment-checklist.md) | The team | Turning every control on in production |
| [vendor-checklist.md](vendor-checklist.md) | The team | Hosting, SMS and database providers for health data (BAAs) |
| [privacy-policy.md](privacy-policy.md) | Residents and families | DRAFT privacy policy, for legal review |
| [pilot-mou-draft.md](pilot-mou-draft.md) | A fire department | DRAFT pilot agreement |
| [grant-narrative-draft.md](grant-narrative-draft.md) | Grant applications | DRAFT project narrative and budget |

Security tests: `tests/security.test.ts` (run `npm test`).
