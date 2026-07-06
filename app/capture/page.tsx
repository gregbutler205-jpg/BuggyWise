"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Parsed = { item: string; quantity: number; unit: string | null; notes: string | null };

export default function CapturePage() {
  const router = useRouter();
  const [tab, setTab] = useState<"type" | "photo">("type");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      if (tab === "type") {
        if (!text.trim()) throw new Error("Type or paste your list first.");
        form.set("text", text);
      } else {
        if (!file) throw new Error("Choose a photo or file first.");
        form.set("file", file);
      }
      const parseRes = await fetch("/api/parse", { method: "POST", body: form });
      const parsed = await parseRes.json();
      if (!parseRes.ok) throw new Error(parsed.error ?? "Parse failed");
      const items: Parsed[] = parsed.items;
      if (!items?.length) throw new Error("Couldn't find any items — try cleaning up the input.");

      const createRes = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), items }),
      });
      const { id } = await createRes.json();
      router.push(`/lists/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">New list</h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="List name (optional — e.g. Weekly Staples)"
        className="w-full rounded-lg border border-bw-ink/20 px-3 py-2 bg-white"
      />

      <div className="flex gap-2">
        {(["type", "photo"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${
              tab === t ? "bg-bw-green text-white" : "bg-white border border-bw-ink/20"
            }`}
          >
            {t === "type" ? "✏️ Type / paste" : "📷 Photo / file"}
          </button>
        ))}
      </div>

      {tab === "type" ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={"milk\n2 lb ground beef\npeanut butter\neggs x2\n..."}
          className="w-full rounded-lg border border-bw-ink/20 px-3 py-2 bg-white font-mono text-sm"
        />
      ) : (
        <label className="block border-2 border-dashed border-bw-green/40 rounded-xl p-8 text-center cursor-pointer bg-white hover:bg-bw-cream">
          <input
            type="file"
            accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            capture="environment"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <span className="font-medium">{file.name}</span>
          ) : (
            <span className="text-bw-ink/60">
              Tap to snap a photo of your handwritten list
              <br />
              or choose an image, PDF, or Word doc
            </span>
          )}
        </label>
      )}

      {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <button
        onClick={submit}
        disabled={busy}
        className="w-full bg-bw-orange text-white font-semibold py-3 rounded-xl hover:bg-bw-orange-dark disabled:opacity-50"
      >
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <Image src="/icons/icon-48.png" alt="" width={20} height={20} className="animate-bounce" />
            Reading your list…
          </span>
        ) : (
          "Parse my list →"
        )}
      </button>
    </div>
  );
}
