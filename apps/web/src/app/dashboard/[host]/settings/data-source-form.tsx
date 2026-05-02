"use client";
import { useRef, useState, useTransition } from "react";
import { uploadDataSourceAction } from "./actions";

const EXAMPLE = `[
  {
    "url": "/blog/best-running-shoes",
    "data": {
      "title": "Best Running Shoes 2026",
      "faqs": [
        { "q": "What size?", "a": "..." }
      ]
    }
  },
  {
    "url": "/blog/best-tennis-shoes",
    "data": {
      "title": "Best Tennis Shoes 2026"
    }
  }
]`;

export function DataSourceForm({ host, hasExisting }: { host: string; hasExisting: boolean }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pasted, setPasted] = useState("");
  const [filePreview, setFilePreview] = useState<{ name: string; records: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [contents, setContents] = useState<string | null>(null);

  async function onFileChosen(file: File) {
    setErr(null);
    if (file.size > 10 * 1024 * 1024) {
      setErr("File too large (max 10 MB).");
      return;
    }
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setErr("File isn't valid JSON.");
      return;
    }
    if (!Array.isArray(parsed)) {
      setErr("Top-level JSON must be an array of records.");
      return;
    }
    setContents(text);
    setFilePreview({ name: file.name, records: parsed.length });
  }

  function submit() {
    setErr(null);
    const json = contents ?? pasted;
    if (!json.trim()) {
      setErr("Choose a file or paste JSON.");
      return;
    }
    const fd = new FormData();
    fd.append("domainHost", host);
    fd.append("recordsJson", json);
    startTransition(async () => {
      try {
        await uploadDataSourceAction(fd);
        setContents(null);
        setPasted("");
        setFilePreview(null);
        if (fileRef.current) fileRef.current.value = "";
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Upload a JSON file</span>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFileChosen(f);
          }}
          className="block w-full rounded-[10px] border border-dashed border-border-strong bg-background px-3 py-3 text-sm file:mr-3 file:rounded-[8px] file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium hover:border-border"
        />
      </label>

      {filePreview && (
        <p className="text-xs text-success">
          ✓ {filePreview.name} parsed — {filePreview.records.toLocaleString()} record
          {filePreview.records === 1 ? "" : "s"} ready to upload.
        </p>
      )}

      <button
        type="button"
        onClick={() => setPasteOpen((v) => !v)}
        className="self-start text-xs text-muted-foreground hover:text-foreground"
      >
        {pasteOpen ? "Hide paste-JSON option" : "Or paste JSON instead →"}
      </button>

      {pasteOpen && (
        <textarea
          name="recordsJson"
          rows={6}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder='[{"url":"/blog/:slug","data":{"title":"…"}}]'
          className="rounded-[10px] border border-border-strong bg-background px-3 py-2 font-mono text-xs"
        />
      )}

      <button
        type="button"
        onClick={() => setExampleOpen((v) => !v)}
        className="self-start text-xs text-muted-foreground hover:text-foreground"
      >
        {exampleOpen ? "Hide schema example" : "Show schema example →"}
      </button>
      {exampleOpen && (
        <pre className="overflow-x-auto rounded-[10px] border border-border/60 bg-card/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {EXAMPLE}
        </pre>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || (!contents && !pasted.trim())}
          className="inline-flex h-9 items-center rounded-[14px] bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Uploading…" : hasExisting ? "Replace" : "Upload"}
        </button>
      </div>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}
