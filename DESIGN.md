# Design notes

The flow is intentionally linear: parser → learned demonstration policy →
consent gate and channel choice → renderer → structured JSON output.

Examples are behavioral data. The current prototype performs simple
example-driven inference using an in-memory labeled demonstration set; task IDs
are not used as rules. Consent is enforced before inference,
so preferences rank only channels that are explicitly opted in. If none are
available, the agent returns a do-not-contact action.

Rendering is deterministic for reproducibility and safety. An LLM or Agents
SDK can later be added for semantic paraphrasing, but it should not bypass the
consent gate or output contract. The current in-memory approach is appropriate
for two examples; production extensions are schema validation, persistent
retrieval, structured logs/metrics, idempotency, retries, and a delivery queue.
