# Two-minute walkthrough

“I treated the JSONL file as both the input contract and a small behavioral
dataset. The program parses records, uses labeled records as demonstrations,
and infers channel and timing patterns. Before selecting a channel, it filters
by explicit consent; if no channel is permitted, it returns do-not-contact.
It then renders a structured message using the current profile and context,
including the CTA and opt-out language. The evaluator compares generated
results with expected results.

I kept the core deterministic because this task has a safety boundary and
needs reproducible output. In production I would add schema validation,
observability, idempotency, and a delivery queue. If the dataset grew, I would
replace in-memory examples with retrieval or embeddings while keeping consent
enforcement and the output schema outside the LLM.”

## Key answers

- TypeScript is valid per the JD and is the candidate's strongest language.
- Deterministic controls protect consent, scheduling, and output shape.
- Retrieval can scale from in-memory examples to embeddings/vector search.
- Conflicting examples should be ranked by similarity and surfaced with
  confidence or sent for review when safety is affected.
