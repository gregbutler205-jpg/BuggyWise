"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ListActions({ listId, isDraft }: { listId: number; isDraft?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-1.5 text-sm shrink-0">
      {isDraft && (
        <button
          disabled={busy}
          onClick={() =>
            call(async () => {
              await fetch(`/api/lists/${listId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isDraft: false }),
              });
            })
          }
          className="px-3 py-1 rounded-full bg-bw-green text-white hover:bg-bw-green-dark disabled:opacity-50"
        >
          Approve
        </button>
      )}
      <button
        disabled={busy}
        onClick={() =>
          call(async () => {
            const res = await fetch(`/api/lists/${listId}/clone`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            const { id } = await res.json();
            router.push(`/lists/${id}`);
          })
        }
        className="px-3 py-1 rounded-full border border-bw-ink/20 hover:bg-bw-cream disabled:opacity-50"
      >
        Clone
      </button>
      <button
        disabled={busy}
        onClick={() => {
          if (!confirm("Delete this list?")) return;
          call(async () => {
            await fetch(`/api/lists/${listId}`, { method: "DELETE" });
          });
        }}
        className="px-3 py-1 rounded-full border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        ✕
      </button>
    </div>
  );
}
