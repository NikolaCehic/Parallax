# Sample Parallax Dossier

Command:

```bash
node src/cli/parallax.js analyze \
  --symbol NVDA \
  --horizon swing \
  --thesis "post-earnings continuation with controlled risk" \
  --ceiling watchlist \
  --now 2026-05-01T14:30:00Z
```

Result summary:

```json
{
  "dossier_id": "dos_1554fa9a5dd2",
  "action_class": "watchlist",
  "thesis_state": "active",
  "confidence": 0.63,
  "freshness_score": 1
}
```

Interpretation:

The thesis is active and watchlist-worthy, not an immediate trade. The strongest bull case is positive momentum under acceptable liquidity and cost proxies. The strongest bear case is that the thesis may be chasing already-visible price action without validated edge.

Key lifecycle triggers:

- invalidate if `last_price < 111.73`;
- recheck if `last_price > 117.47`;
- downgrade if volatility expands beyond threshold;
- downgrade when the evidence snapshot expires.

This is the intended Parallax behavior: it does not say "buy." It says the thesis is conditional, monitored, and subject to invalidation.
