# Security Policy

## Supported Versions

Parallax is pre-1.0 software. Security fixes are applied to the main branch until formal releases begin.

## Reporting A Vulnerability

Please open a private security advisory on GitHub or contact the repository owner directly if private disclosure is needed.

Include:

- affected version or commit;
- reproduction steps;
- expected impact;
- whether credentials, market data, personal data, or tenant isolation are involved.

## Sensitive Data Rules

Do not commit:

- API keys;
- brokerage credentials;
- private market data;
- user account data;
- raw provider secrets;
- production tenant state.

Parallax should store secret references or environment variable names, not raw secrets.

## Financial Safety Scope

Security issues also include changes that bypass product ceilings, disable claim validation, persist raw credentials, weaken tenant isolation, or silently unlock live execution.
