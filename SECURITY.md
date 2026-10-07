# Security policy

## Reporting a vulnerability

Please report it privately through GitHub: open the repository's **Security**
tab and choose **Report a vulnerability**. Do not open a public issue.

- We acknowledge a report within **72 hours**.
- We follow **90-day coordinated disclosure**: a fix is released, or the report
  is made public by agreement, within 90 days of the report.

## Supported versions

Only the latest `main` is supported. There are no maintained release branches.

## Scope

Share links (`/c/<token>`, `/v/<token>`) are bearer URLs by design: anyone
holding one can view that recording, and the owner can revoke it at any time.
That is not a vulnerability. A way to guess a token, read another workspace's
data, or read through a revoked link is. See `CLAUDE.md` for the model.
