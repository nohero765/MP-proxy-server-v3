---
name: Loon binary build
description: How to build the loon Go binary on Replit; no prebuilt releases exist as of mid-2026.
---

The loon project (https://github.com/ungive/loon) has no GitHub Releases with prebuilt binaries.
Must be compiled from source using Go.

**Go is not installed by default on Replit NixOS.** Install via:
```js
await installProgrammingLanguage({ language: "go-1.25" });
```

**Build command** (CGO_ENABLED=0 required for static linking on NixOS):
```bash
CGO_ENABLED=0 go build -ldflags='-extldflags "-static"' -o loon-bin ./cmd/loon
```

**Why:** Dynamic linking fails at runtime in the Replit sandbox without glibc stubs. Static binary runs anywhere.

**How to apply:**
- `build.mjs` calls `buildLoonBinary()` as a non-fatal post-build step (catches errors, logs warning)
- `loon-manager.ts` `ensureBinary()` lazily builds on first start if binary is missing
- Binary saved to `artifacts/api-server/loon-bin`
- Source cloned to `/tmp/loon-build-src` (ephemeral)
- The build takes ~60s on first run (dependency downloads)
