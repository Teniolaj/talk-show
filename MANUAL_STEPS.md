# Manual steps — slide headings, transcription & matching upgrade

These steps are **not** doable from this repo's code — they happen in n8n's cloud editor and the Supabase dashboard. Do them in this order; the app-side code (already implemented) expects the `heading` column to exist and to be populated by newly-ingested documents.

## 1. Supabase — add the `heading` column

In the Supabase dashboard's SQL editor, run:

```sql
ALTER TABLE repo_chunks ADD COLUMN heading text;
```

No index needed. Existing chunks will have `heading IS NULL` — they keep working via topic-tag matching, but won't be selectable by an explicit "slide on ___" voice command until re-ingested (step 3).

## 2. n8n — stop dropping the heading during ingestion

Open the live ingestion workflow in n8n's cloud editor (**not** the committed `n8n/Talkshow-Repo-Ingestion-1.json` in this repo — that export is known stale).

**a) "Merge Embedding" node**

It currently returns something like:

```js
return {
  json: {
    repo_id: original.repo_id,
    document_id: original.document_id,
    content: original.content,
    topic_tags: original.topic_tags,
    embedding: embedding,
  },
};
```

Add one line so `heading` passes through:

```js
return {
  json: {
    repo_id: original.repo_id,
    document_id: original.document_id,
    heading: original.heading,
    content: original.content,
    topic_tags: original.topic_tags,
    embedding: embedding,
  },
};
```

("Chunk & Tag", the node before it, already computes `heading` per chunk — nothing to change there.)

**b) "Insert Chunk" node** (the Supabase node that writes to `repo_chunks`)

Add a new field mapping alongside the existing `repo_id` / `document_id` / `content` / `topic_tags` / `embedding` ones:

- Field: `heading`
- Value: `={{ $json.heading }}`

**c) Publish** the workflow (n8n's "Publish" dropdown, not just Active/Inactive) so the change is live.

## 3. Re-ingest documents you want voice-selectable

Existing `repo_chunks` rows won't get a `heading` retroactively. For any document you want to be able to say "slide on ___" for, re-upload/re-ingest it from `/upload` or `/content-library` after step 2 is published.

Quick check it worked, in the Supabase SQL editor:

```sql
select id, heading from repo_chunks where document_id = '<a just-reingested document id>';
```

`heading` should be populated (not all `null`) for that document's rows.

## 4. Try it live

Once the above is done:

1. Start a live session (`/live/room`) for a talk show using a re-ingested document.
2. Say something containing **"slide on &lt;a real heading from that document&gt;"** — the display should switch immediately and show "You selected: …" instead of "Detected: …".
3. Optional: in `/settings`, turn off "automatic detection" and confirm the "slide on ___" command still works even with auto-detection off.

If a heading match doesn't seem to trigger, check the phrase you said against the actual stored `heading` text (the fuzzy match tolerates some difference, but a completely different word won't match) via the SQL query in step 3.
