# @stateforge-labs/harness-adapters

A private workspace package. It is not published and currently contains no code.

Its shipped code must not use a Bun API, because the library it depends on runs under Node. `tools/check-boundaries.ts` enforces this
for every package whose code ships.

It depends on [`@stateforge-labs/harness-hooks`](https://github.com/stateforge-labs/harness-kit/blob/main/packages/hooks/README.md) for the neutral event and reply types. The repository's
[README](https://github.com/stateforge-labs/harness-kit#readme) lists the packages that are in use.
