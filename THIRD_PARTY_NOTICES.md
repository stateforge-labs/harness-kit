# Third-party notices

## @anthropic-ai/claude-agent-sdk 0.3.316

- Role: an optional peer dependency of the Claude agent engine, at exactly this version. This package does not install it; a consumer that starts agent runs adds it. It is loaded by a dynamic import at the first agent run and never at import time, so using the one-shot facet or only importing this package does not load it.
- Licence: all rights reserved by Anthropic PBC. Use is subject to the legal agreements published at https://code.claude.com/docs/en/legal-and-compliance. The package ships no open-source licence text.
- Consumers who add the SDK accept those terms for the SDK and for the Claude Code binary it drives. Credentials passed to an agent run must follow the authentication rules in those agreements.
