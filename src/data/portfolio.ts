import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "../evidence/csv.js";

export async function portfolioFromCsv({
  csvPath,
  accountId = "csv_import",
  cash = 0,
  totalEquity,
  restrictedSymbols = []
}: {
  csvPath: string;
  accountId?: string;
  cash?: number;
  totalEquity?: number;
  restrictedSymbols?: string[];
}) {
  const rows = parseCsv(await readFile(csvPath, "utf8"));
  const positions = rows
    .filter((row: any) => row.symbol)
    .map((row: any) => ({
      symbol: String(row.symbol).toUpperCase(),
      quantity: Number(row.quantity ?? row.shares ?? 0),
      market_value: Number(row.market_value ?? row.value ?? 0),
      sector: row.sector || "unknown"
    }));
  const inferredEquity = positions.reduce((sum, position) => sum + position.market_value, 0) + Number(cash);
  return {
    account_id: accountId,
    cash: Number(cash),
    total_equity: Number(totalEquity ?? inferredEquity),
    positions,
    constraints: {
      max_single_name_pct: 0.12,
      max_sector_pct: 0.35,
      max_gross_exposure_pct: 1,
      paper_risk_budget_pct: 0.02
    },
    restricted_symbols: restrictedSymbols.map((symbol) => symbol.toUpperCase())
  };
}

export async function writePortfolioJson({
  csvPath,
  out,
  accountId,
  cash,
  totalEquity,
  restrictedSymbols = []
}: {
  csvPath: string;
  out: string;
  accountId?: string;
  cash?: number;
  totalEquity?: number;
  restrictedSymbols?: string[];
}) {
  const portfolio = await portfolioFromCsv({
    csvPath,
    accountId,
    cash,
    totalEquity,
    restrictedSymbols
  });
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(portfolio, null, 2)}\n`);
  return {
    out,
    account_id: portfolio.account_id,
    positions: portfolio.positions.length,
    total_equity: portfolio.total_equity,
    restricted_symbols: portfolio.restricted_symbols.length
  };
}
