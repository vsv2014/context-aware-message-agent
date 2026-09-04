# Context-Aware Message Agent — Architecture Review Packet

## 1. Problem interpretation

The input is JSONL. Each line contains customer context, consent,
communication preferences, constraints, and sometimes an expected answer.
The system must decide:

1. Whether to communicate.
2. Which permitted channel to use.
3. When to send the message.
4. What message and CTA to produce.
5. What follow-up action to schedule.

The expected output is behavioral, not necessarily textually identical. The
message should semantically match the expected decision while respecting
consent, opt-out, privacy, and fair-housing constraints.

## 2. Design principles

- Keep the core decision path deterministic and easy to test.
- Treat examples as behavioral knowledge, not executable rules.
- Never infer permission from preference; consent is a hard gate.
- Keep safety controls outside an LLM.
- Validate inputs and outputs at system boundaries.
- Make every decision observable and explainable.
- Start with the simplest architecture justified by the dataset.
- Add retrieval, embeddings, or an LLM only when the data volume or language
  quality requires them.

## 3. Current architecture

```text
JSONL file / browser UI
          |
          v
    JSONL parser
          |
          v
Labeled demonstration set
          |
          v
Consent gate + channel selection
          |
          v
Timezone-aware scheduling
          |
          v
Deterministic message renderer
          |
          v
Structured JSON result
          |
          v
Evaluator and safety checks
```

The implementation is in `src/index.ts`. The browser wrapper is
`src/server.ts` plus `web/index.html`. `src/evaluator.ts` and
`test/agent.test.ts` provide evaluation and regression coverage.

## 4. Decision flow

### Step A — Parse

Read one JSON object per line. Reject malformed records rather than silently
continuing with partial data.

### Step B — Build demonstrations

Records with `expected.next_message` are treated as labeled examples. The
current prototype keeps them in memory because the sample is tiny.

For a larger system, demonstrations should be stored separately from the
evaluation set. This avoids training/evaluation leakage.

### Step C — Enforce consent

Filter `channel_preferences` using explicit opt-in fields:

```text
eligible channels = preferred channels where channel_opt_in === true
```

If the eligible set is empty:

```json
{
  "next_message": null,
  "next_action": {
    "type": "do_not_contact",
    "reason": "no consented channel"
  }
}
```

This is a safety invariant. It must not be delegated to an LLM.

### Step D — Select a channel

Use the user's ordered preferences as the tie-breaker. Demonstrations provide
the behavioral signal for which eligible channel is appropriate. If examples
conflict, a production version should use similarity-weighted votes and expose
confidence.

### Step E — Schedule

Calculate the delivery timestamp in the input timezone. Learn delivery-hour
and follow-up timing patterns from demonstrations where available. In a
production system, quiet hours and regulatory constraints should be explicit
validated policy, not inferred from prose.

### Step F — Render

Use profile/context fields for personalization, include the requested CTA,
and include opt-out instructions whenever the constraints require them.

### Step G — Evaluate

Report separate metrics for:

- Send/no-send decision.
- Channel.
- Action type.
- CTA.
- Timing tolerance.
- Semantic message similarity.
- Personalization.
- Safety violations.

Exact body-string comparison is useful for regression but is not sufficient for
semantic evaluation.

## 5. Why this is not full RAG today

The current implementation is example-driven inference, not classic RAG. It
does not use embeddings, a vector database, or an LLM. That is intentional: two
examples do not justify a retrieval infrastructure or model dependency.

The production evolution would be:

```text
Historical examples
        |
Normalize important fields
        |
Create embeddings / searchable features
        |
Retrieve top-k similar examples
        |
Build constrained reasoning context
        |
Optional LLM message generation
        |
Schema validation + deterministic safety gate
        |
Final output
```

The LLM should generate language, not grant consent or override policy.

## 6. Recommended production boundary

```text
API request
  -> Input schema validation
  -> Consent/policy service
  -> Similar-example retrieval
  -> Decision engine
  -> Optional message generator
  -> Output schema validation
  -> Idempotency check
  -> Message queue
  -> SMS/email provider
```

The assessment only needs the first five logical stages. A queue and provider
are deliberately outside scope unless asked.

## 7. Data contracts

The production version should define typed schemas for:

- `InputRecord`
- `Consent`
- `Context/Profile`
- `Constraints`
- `NextMessage`
- `NextAction`
- `DecisionMetadata`

Recommended output extension:

```json
{
  "task_id": "example",
  "next_message": {},
  "next_action": {},
  "decision_metadata": {
    "policy_version": "v1",
    "selected_channel_reason": "highest-ranked consented preference",
    "confidence": 0.91,
    "demonstration_ids": ["example-1", "example-7"]
  }
}
```

Do not expose chain-of-thought. Return concise decision metadata instead.

## 8. Error and safety behavior

- Malformed JSONL: report line number and reject the record.
- Missing consent: do not contact.
- Unsupported channel: ignore it and continue with eligible channels.
- Conflicting examples: lower confidence and request review if material.
- Invalid timezone: use a safe default only if policy permits; otherwise reject.
- Missing first name: use a neutral greeting.
- Missing CTA data: return a validation error instead of inventing a link.
- Duplicate processing: use an idempotency key in production.
- Provider failure: retry with backoff and use a dead-letter queue.

## 9. Security and compliance

- Minimize PII in logs.
- Never log full message bodies if they contain sensitive data.
- Validate URLs and prevent untrusted links from being injected.
- Treat profile fields and retrieved examples as untrusted data.
- Keep LLM prompts separate from user-provided instructions.
- Enforce opt-out and consent independently from generated text.
- Add fair-housing policy checks before delivery.
- Add authentication and rate limiting to a hosted UI/API.
- Limit request body size for the browser endpoint.

## 10. Testing strategy

### Unit tests

- Consent filtering.
- Preference ordering.
- No-consent behavior.
- Timezone conversion.
- Long- and short-horizon scheduling.
- CTA and opt-out generation.
- Missing optional profile fields.

### Integration tests

- JSONL file to JSONL output.
- Browser API request to structured response.
- Malformed record handling.

### Evaluation tests

- Hold out records from the demonstration set.
- Measure decision, channel, action, safety, and semantic scores separately.
- Add adversarial records with conflicting preferences and missing consent.

## 11. Current limitations to state openly

1. The sample contains only two cases.
2. Current demonstration lookup is in-memory and simple.
3. The current renderer has a small deterministic template set.
4. The demo endpoint has no authentication or persistence.
5. The evaluator's exact match is stricter than semantic matching.

These are scope decisions for a small assessment, not hidden production claims.

## 12. Interview questions and answers

### Why TypeScript?

The JD explicitly accepts TypeScript/JavaScript. It is also the candidate's
strongest language, so it minimizes implementation risk and supports strict
input/output typing.

### Why not use an LLM for the whole flow?

Consent and policy enforcement require deterministic behavior. An LLM can help
with language generation, but its output must be schema-validated and cannot
override safety controls.

### How does it generalize without hardcoded rules?

Behavioral examples provide the policy signal. The system extracts context,
retrieves relevant examples, and applies the learned pattern to a new record.
Task IDs are never used as business rules.

### What happens at scale?

Move demonstrations to a searchable store, use similarity retrieval, cache
stable policy decisions, add a stateless API, queue delivery, add idempotency,
and monitor quality, latency, safety, and cost.

### What would you ask the interviewer?

- Are expected outputs mixed with inputs, or is there a separate train/test set?
- Is an LLM required, optional, or prohibited?
- How is semantic similarity scored?
- Should explanations be returned in the output?
- Are quiet hours, opt-outs, and regulatory policies part of hidden tests?

## 13. Review prompt for another agent

> Review this repository as a senior staff engineer. Check whether the design
> is simple enough for a live interview, whether the decision flow truly learns
> from examples rather than task IDs, whether consent and privacy are enforced
> safely, whether the TypeScript contracts and error handling are production
> quality, and whether the evaluator measures semantic behavior correctly.
> Identify concrete bugs, hidden-test risks, overengineering, and the top five
> changes to make before submission. Distinguish implemented behavior from
> recommended future architecture.
