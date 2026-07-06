"use client";

import { useEffect, useState } from "react";
import type { TripScenario } from "@/db/schema";

const CONF: Record<string, string> = {
  api: "🟢",
  weekly_ad: "🟡",
  remembered: "🟠",
  unknown: "🔴",
};

const fmt = (n: number) => `$${n.toFixed(2)}`;

export function Checklist({
  tripId,
  scenario,
  checkedOff,
  storeNames,
  storeAddresses,
  itemNames,
}: {
  tripId: number;
  scenario: TripScenario;
  checkedOff: Record<string, boolean>;
  storeNames: Record<number, string>;
  storeAddresses: Record<number, string>;
  itemNames: Record<number, string>;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(checkedOff);
  // null = print everything; a storeId = print only that store's list (set
  // by a per-store "Print" button, reset once the print dialog closes)
  const [printOnly, setPrintOnly] = useState<number | null>(null);

  useEffect(() => {
    if (printOnly === null) return;
    const reset = () => setPrintOnly(null);
    window.addEventListener("afterprint", reset);
    // let the single-store view render before the print dialog opens
    const t = setTimeout(() => window.print(), 50);
    return () => {
      window.removeEventListener("afterprint", reset);
      clearTimeout(t);
    };
  }, [printOnly]);

  async function toggle(listItemId: number) {
    const next = { ...checked, [listItemId]: !checked[listItemId] };
    setChecked(next);
    // fire-and-forget persistence — checking off must feel instant in-store
    fetch(`/api/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkedOff: next }),
    }).catch(() => {});
  }

  const total = scenario.assignments.length;
  const done = scenario.assignments.filter((a) => checked[a.listItemId]).length;

  function share() {
    const text = scenario.storeIds
      .map((sid) => {
        const lines = scenario.assignments
          .filter((a) => a.storeId === sid)
          .map((a) => `  • ${itemNames[a.listItemId] ?? "?"} — ${fmt(a.price)}`);
        const sub = scenario.storeSubtotals.find((s) => s.storeId === sid);
        return `${storeNames[sid]}${sub ? ` (${fmt(sub.subtotal)})` : ""}:\n${lines.join("\n")}`;
      })
      .join("\n\n");
    const full = `🐞 BuggyWise plan: ${scenario.label}\n\n${text}\n\nGrand total: ${fmt(scenario.grandTotal)}`;
    if (navigator.share) {
      navigator.share({ title: "BuggyWise shopping plan", text: full }).catch(() => {});
    } else {
      navigator.clipboard.writeText(full);
      alert("Plan copied to clipboard");
    }
  }

  return (
    <div className="space-y-6 print:text-black">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">{scenario.label}</h1>
        <div className="flex gap-2 print:hidden">
          <button onClick={share} className="px-3 py-1.5 rounded-full border border-bw-ink/20 text-sm hover:bg-bw-cream">
            Share
          </button>
          <button onClick={() => window.print()} className="px-3 py-1.5 rounded-full border border-bw-ink/20 text-sm hover:bg-bw-cream">
            Print
          </button>
        </div>
      </div>

      <div className="text-sm text-bw-ink/60 print:hidden">
        {done}/{total} picked up
        {scenario.savings > 0.005 && (
          <span className="text-bw-green-dark font-medium"> · saving {fmt(scenario.savings)} this trip 🐞</span>
        )}
      </div>

      {/* shopping route (spec §3): ordered stops with map deep-links */}
      {scenario.storeIds.length > 1 && printOnly === null && (
        <div className="bg-bw-cream rounded-xl px-4 py-3 text-sm print:hidden">
          🛣️ Route:{" "}
          {scenario.storeIds.map((sid, i) => (
            <span key={sid}>
              {i > 0 && " → "}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeAddresses[sid] ?? storeNames[sid])}`}
                target="_blank"
                rel="noreferrer"
                className="underline text-bw-green-dark"
              >
                {storeNames[sid]}
              </a>
            </span>
          ))}
        </div>
      )}

      {scenario.storeIds
        .filter((sid) => printOnly === null || sid === printOnly)
        .map((sid) => {
        const assignments = scenario.assignments.filter((a) => a.storeId === sid);
        if (assignments.length === 0) return null;
        const sub = scenario.storeSubtotals.find((s) => s.storeId === sid);
        return (
          <section key={sid} className="bg-white rounded-xl border border-bw-ink/10 p-4 print:break-after-page last:print:break-after-auto">
            <div className="flex justify-between items-center font-semibold text-lg border-b border-bw-ink/10 pb-2 mb-2">
              <span>{storeNames[sid]}</span>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => setPrintOnly(sid)}
                  className="print:hidden text-xs font-medium border border-bw-ink/20 rounded-full px-2.5 py-1 hover:bg-bw-cream"
                  title={`Print just ${storeNames[sid]}'s list`}
                >
                  🖨️ Print
                </button>
                <span>{sub ? fmt(sub.subtotal) : ""}</span>
              </span>
            </div>
            <ul className="divide-y divide-bw-ink/5">
              {assignments.map((a) => (
                <li key={a.listItemId}>
                  <button
                    onClick={() => toggle(a.listItemId)}
                    className="w-full flex items-center gap-3 py-2.5 text-left"
                  >
                    <span
                      className={`size-6 rounded-md border-2 flex items-center justify-center text-sm shrink-0 ${
                        checked[a.listItemId] ? "bg-bw-green border-bw-green text-white" : "border-bw-ink/30"
                      }`}
                    >
                      {checked[a.listItemId] ? "✓" : ""}
                    </span>
                    <span className={`flex-1 min-w-0 ${checked[a.listItemId] ? "line-through text-bw-ink/40" : ""}`}>
                      <span className="font-medium">{itemNames[a.listItemId] ?? "?"}</span>
                      <span className="block text-xs text-bw-ink/50 truncate">
                        {CONF[a.confidence] ?? "🔴"} {a.productName}
                        {a.saleEnds ? ` · sale ends ${a.saleEnds}` : ""}
                        {a.weightAdjusted ? " · priced per lb, final total varies by weight" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium">{a.weightAdjusted ? "≈ " : ""}{fmt(a.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {printOnly === null && (
        <div className="flex justify-between font-bold text-xl bg-white rounded-xl border border-bw-ink/10 p-4">
          <span>Grand total</span>
          <span>{fmt(scenario.grandTotal)}</span>
        </div>
      )}
    </div>
  );
}
