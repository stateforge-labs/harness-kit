# Security Policy

harness-kit runs a local HTTP server that receives agent hook payloads, and it can load middleware modules you name. Reports about
either matter, and we treat them as a priority.

## Reporting a vulnerability

Report it privately through GitHub's private vulnerability reporting for this repository:

<https://github.com/stateforge-labs/harness-kit/security/advisories/new>

Include what you found, the package and version, the steps to reproduce it, and what an attacker gains. A proof of concept helps, but do
not send a payload that contains real prompts, tokens or other private data.

Do not open a public issue or pull request for a vulnerability until it is fixed and disclosed.

## What to expect

- **Acknowledgement:** within 14 days of your report. We confirm the report or ask for what we need.
- **Assessment:** we say whether we accept the report and how severe we think it is.
- **Fix:** we work on a fix in a private advisory and tell you when to expect a release.
- **Disclosure:** we publish a GitHub security advisory with the fix. We aim to disclose within 90 days of the report, and sooner once a
  fix is released. If we cannot meet that, we tell you why and agree a new date with you.
- **Credit:** we credit reporters in the advisory unless they ask us not to.

## Supported versions

Security fixes go to the latest released version only.

## Scope

In scope: the admission checks of the hook server (bearer token, loopback rules, `Host` and content-type checks), request parsing and
the body size limit, the logs (anything that writes a field the allowlist does not allow, or leaks a token or prompt text), the
installers (writing files outside the paths they name), the command shim and the OpenCode plugin in their fail-open and fail-closed modes,
and the `HOOK_MIDDLEWARE` loader.

Out of scope: a middleware module you chose to load, which runs with the server's permissions by design; denial of service from a host that
already has access to the server's port; and issues in harness products (Claude Code, Codex, OpenCode), which go to their vendors.
