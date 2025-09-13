# Security & Secrets Guidance

This repository must never contain live secrets. Follow these rules:

- Do not commit .env or any .env.* files. Use .env.example as the authoritative template and keep it up to date.
- Store real secrets in a secure vault (e.g., 1Password, Azure Key Vault, AWS Secrets Manager, or GCP Secret Manager).
- Rotate any secrets that were ever committed to the repo history.
- Prefer per‑developer .env.local files that are ignored by Git.

Rotation checklist when secrets have leaked:
- Revoke/rotate keys at each provider (DBs, Redis, email, APIs, OAuth, OpenAI, etc.).
- Update the new values in your secret manager and local .env.
- Redeploy services with the rotated secrets.

Git hygiene (run from project root):
- Ensure .gitignore excludes secrets and logs.
- If secrets were tracked, untrack them and purge from history if necessary:
  - git rm --cached .env
  - git rm --cached -r logs/
  - Commit the removal and force rotation of any exposed values.

Operational tips:
- Keep .env.example complete and non‑sensitive so others can bootstrap quickly.
- Avoid printing secrets in logs; scrub sensitive fields before logging.
- Review Snyk reports regularly and fail CI on High/Critical vulns in prod deps.