# Code Provenance

> Every line of code has a story. We tell it.

A code fingerprinting engine that answers the questions everyone is asking but nobody has tools for:

- **Was this code written by AI?** Detect AI-generated code with high accuracy
- **Which AI model wrote it?** Distinguish between GPT, Claude, Gemini, Copilot patterns
- **Is this code stolen?** Find copied code across the open-source ecosystem
- **License violations?** Detect code that violates its source license
- **Code lineage?** Trace where code came from and how it evolved

## Why now?

AI-generated code is flooding GitHub. Developers copy-paste from ChatGPT without thinking about licenses. Companies ship code they don't own. **Nobody has tools to detect this.** Until now.

## Quick Start

```bash
# Scan a file
npx code-provenance scan ./src/auth.ts

# Scan an entire project  
npx code-provenance scan ./my-project --recursive

# Generate a provenance report
npx code-provenance report ./my-project --format html
```

## Output

```
📊 Provenance Report: src/auth.ts
├── Lines 1-45:   🤖 AI-generated (92% confidence) — Claude-style patterns
├── Lines 46-120: 👤 Human-written (88% confidence)
├── Lines 121-180: ⚠️  Matches: lodash/throttle (MIT) — OK
└── Lines 181-220: 🚨 Matches: proprietary-lib (GPL-3.0) — LICENSE VIOLATION
```

## Status

🚧 **Under active development** — Star this repo to follow progress!

## License

MIT
