#!/usr/bin/env python3
"""Deterministic analytics worker for Parallax.

The TypeScript agent orchestrator sends an EvidenceSnapshot JSON object on stdin.
This worker returns versioned deterministic analytics payloads as JSON. It uses
only the Python standard library so it can run in constrained environments.
"""

from __future__ import annotations

import json
import math
import statistics
import sys
from datetime import datetime, timezone
from typing import Any


def pct_change(previous: float, current: float) -> float:
    if previous == 0:
        return 0.0
    return (current - previous) / previous


def returns(candles: list[dict[str, Any]]) -> list[float]:
    values: list[float] = []
    for index in range(1, len(candles)):
        values.append(pct_change(float(candles[index - 1]["close"]), float(candles[index]["close"])))
    return values


def mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    return statistics.pstdev(values)


def max_drawdown(candles: list[dict[str, Any]]) -> float:
    if not candles:
        return 0.0
    peak = float(candles[0]["close"])
    worst = 0.0
    for candle in candles:
        close = float(candle["close"])
        peak = max(peak, close)
        if peak:
            worst = min(worst, (close - peak) / peak)
    return worst


def correlation(left: list[float], right: list[float]) -> float:
    count = min(len(left), len(right))
    if count < 2:
        return 0.0
    left = left[-count:]
    right = right[-count:]
    left_mean = mean(left)
    right_mean = mean(right)
    numerator = sum((left[i] - left_mean) * (right[i] - right_mean) for i in range(count))
    left_den = math.sqrt(sum((value - left_mean) ** 2 for value in left))
    right_den = math.sqrt(sum((value - right_mean) ** 2 for value in right))
    if left_den == 0 or right_den == 0:
        return 0.0
    return numerator / (left_den * right_den)


def get_item(snapshot: dict[str, Any], kind: str, symbol: str | None = None) -> dict[str, Any]:
    for item in snapshot["items"]:
        if item["kind"] == kind and (symbol is None or item.get("symbol") == symbol):
            return item
    raise KeyError(f"Missing evidence item: {kind}/{symbol}")


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def tool(tool_name: str, inputs: list[dict[str, Any]], result: dict[str, Any], status: str = "passed") -> dict[str, Any]:
    return {
        "tool_name": tool_name,
        "input_ids": [item["id"] for item in inputs],
        "status": status,
        "result": result,
    }


def run(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    symbol = snapshot["question"]["symbol"]
    price_evidence = get_item(snapshot, "price", symbol)
    portfolio_evidence = get_item(snapshot, "portfolio", "PORTFOLIO")
    event_evidence = get_item(snapshot, "event", symbol)

    candles = price_evidence["payload"]
    ret = returns(candles)
    latest = candles[-1]
    previous = candles[-2] if len(candles) > 1 else None
    lookback = candles[-21] if len(candles) >= 21 else candles[0]
    momentum_20 = pct_change(float(lookback["close"]), float(latest["close"]))
    daily_vol = stddev(ret[-20:])
    annualized_vol = daily_vol * math.sqrt(252)
    avg_volume_20 = mean([float(candle["volume"]) for candle in candles[-20:]])
    rel_volume = float(latest["volume"]) / max(avg_volume_20, 1)
    range_pct = (float(latest["high"]) - float(latest["low"])) / float(latest["close"])
    drawdown = max_drawdown(candles)

    outputs: list[dict[str, Any]] = [
        tool(
            "return_summary",
            [price_evidence],
            {
                "latest_close": float(latest["close"]),
                "one_day_return": pct_change(float(previous["close"]), float(latest["close"])) if previous else 0,
                "momentum_20": momentum_20,
                "sample_size": len(candles),
            },
        ),
        tool(
            "volatility_check",
            [price_evidence],
            {
                "daily_volatility_20": daily_vol,
                "annualized_volatility_20": annualized_vol,
                "high_volatility": annualized_vol > 0.65,
            },
            "warning" if annualized_vol > 0.85 else "passed",
        ),
        tool(
            "drawdown_check",
            [price_evidence],
            {
                "max_drawdown": drawdown,
                "severe_drawdown": drawdown < -0.25,
            },
            "warning" if drawdown < -0.35 else "passed",
        ),
        tool(
            "liquidity_check",
            [price_evidence],
            {
                "average_volume_20": round(avg_volume_20),
                "latest_volume": float(latest["volume"]),
                "relative_volume": rel_volume,
                "range_pct": range_pct,
                "liquidity_score": max(0.0, min(1.0, math.log10(max(avg_volume_20, 1)) / 8)),
            },
            "warning" if avg_volume_20 < 500_000 else "passed",
        ),
        tool(
            "transaction_cost_model",
            [price_evidence],
            {
                "estimated_spread_bps": round(max(2, range_pct * 1200)),
                "estimated_slippage_bps": round(max(3, range_pct * 900)),
                "cost_model": "python_range_proxy_v0",
            },
        ),
    ]

    for dependency in [item for item in snapshot["items"] if item["kind"] == "price" and item.get("symbol") != symbol][:2]:
        outputs.append(
            tool(
                "dependency_correlation",
                [price_evidence, dependency],
                {
                    "dependency": dependency["symbol"],
                    "correlation_60": correlation(ret[-60:], returns(dependency["payload"])[-60:]),
                },
            )
        )

    portfolio = portfolio_evidence["payload"]
    positions = portfolio.get("positions", [])
    constraints = portfolio.get("constraints", {})
    total_equity = portfolio.get("total_equity", portfolio.get("cash", 100000))
    existing = next((position for position in positions if position.get("symbol") == symbol), None)
    existing_pct = (existing["market_value"] / total_equity) if existing else 0
    sector_pct = sum(
        position["market_value"] / total_equity
        for position in positions
        if position.get("sector") == "semiconductors"
    )
    max_single = constraints.get("max_single_name_pct", 0.12)
    max_sector = constraints.get("max_sector_pct", 0.35)

    outputs.append(
        tool(
            "portfolio_exposure_check",
            [portfolio_evidence],
            {
                "total_equity": total_equity,
                "existing_symbol_exposure_pct": existing_pct,
                "semiconductor_exposure_pct": sector_pct,
                "max_single_name_pct": max_single,
                "max_sector_pct": max_sector,
                "paper_risk_budget_pct": constraints.get("paper_risk_budget_pct", 0.02),
                "concentration_breach": existing_pct > max_single or sector_pct > max_sector,
            },
            "warning" if existing_pct > max_single or sector_pct > max_sector else "passed",
        )
    )

    snapshot_time = parse_iso(snapshot["created_at"])
    upcoming_events = [
        event
        for event in event_evidence["payload"]
        if parse_iso(event["date"]) >= snapshot_time
    ]
    material_count = len([event for event in upcoming_events if event.get("materiality") == "high"])
    outputs.append(
        tool(
            "event_calendar_check",
            [event_evidence],
            {
                "upcoming_events": upcoming_events,
                "material_event_count": material_count,
            },
            "warning" if material_count > 0 else "passed",
        )
    )

    stale_items = [item for item in snapshot["items"] if item.get("freshness_status") != "fresh"]
    outputs.append(
        tool(
            "data_quality_check",
            snapshot["items"],
            {
                "stale_item_ids": [item["id"] for item in stale_items],
                "restricted_license_item_ids": [
                    item["id"] for item in snapshot["items"] if item.get("license") == "restricted"
                ],
                "passed": len(stale_items) == 0,
            },
            "warning" if stale_items else "passed",
        )
    )

    return outputs


def main() -> None:
    snapshot = json.load(sys.stdin)
    json.dump(run(snapshot), sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
