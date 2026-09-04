# Context-aware message agent

This is a deliberately small TypeScript solution for the RealPage assessment.
The JD accepts Python and/or TypeScript/JavaScript; TypeScript is used here
because it is the candidate's strongest language and keeps the implementation
easy to explain live.

## Assumptions

- `expected` outputs are demonstration labels when they are present.
- Hidden tests may omit `expected` outputs.
- Consent is a non-negotiable safety policy.
- Preferences influence channel ranking only after consent is verified.
- The prototype is optimized for correctness, explainability, and a small
  dataset; it does not require RAG or an external LLM.

`src/agent.ts` reads JSONL records and emits one JSON result per line:

```bash
npm install
npm start -- 'sample (1).jsonl' --pretty
npm run evaluate -- 'sample (1).jsonl'
```

The demo runs without an API key using deterministic example-driven inference.
If an LLM adapter is added later, configure it only through environment
variables copied from `.env.example`; never put keys in browser code or source
control.

The flow is intentionally linear: JSONL parser → demonstration policy →
consent gate/channel choice → message renderer → JSONL output.

Records containing `expected` are demonstrations. The agent learns channel and
timing patterns from them, then combines those patterns with consent,
preferences, timezone, move horizon, profile, and constraints. The consent gate
is a safety invariant: no consented channel means `next_message: null`.

See [DESIGN.md](DESIGN.md) and [INTERVIEW.md](INTERVIEW.md) for the trade-offs
and the two-minute walkthrough.

The output deliberately contains only the task id, next message, and next
action; it does not copy the input's expected answer into the result.
