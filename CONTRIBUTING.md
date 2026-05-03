# Contributing To Parallax

Thanks for considering a contribution. Parallax is a governed financial-research CLI, so changes should make thesis reasoning more inspectable, more falsifiable, or easier to operate safely.

## Local Setup

```bash
npm install
npm test
```

Initialize a throwaway workspace:

```bash
npm run init -- --dir /tmp/parallax-workspace
```

## Contribution Rules

- Keep tests deterministic by default.
- Do not require live API keys in CI.
- Keep numeric market claims tied to deterministic tool outputs.
- Do not weaken product ceilings or execution gates.
- Do not persist raw API keys, provider secrets, brokerage credentials, or private market data.
- Add e2e or smoke coverage for user-facing CLI workflows.
- Prefer small, reviewable changes with clear safety impact.

## Pull Request Checklist

- `npm test` passes.
- `git diff --check` passes.
- README or docs are updated for user-facing changes.
- New provider paths fail closed when credentials, responses, or validation are invalid.
- Generated artifacts are included only when they materially prove a phase or release.

## Financial Safety

Parallax is research software. Contributions must not present Parallax as investment advice, a broker, an adviser, a signal service, or a live trading system.
