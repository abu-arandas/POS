# Third-Party Licenses

Records the disposition of the dependency-license review. It exists so the next
scan of the dependency graph does not have to re-derive the same conclusions
from scratch.

## Summary of the graph

678 packages are installed for development. 656 of them carry a permissive
license — MIT, ISC, Apache-2.0, BSD-2/3-Clause, BlueOak-1.0.0, 0BSD, MIT-0,
CC0-1.0, WTFPL — none of which places any condition on this project beyond
attribution. Three carry MPL-2.0, covered below. The remainder are permissive
dual-licenses (`MIT OR CC0-1.0`, `WTFPL OR ISC`) and documentation licenses
(`CC-BY-4.0`, `Python-2.0`) on tooling assets.

The application's own runtime dependencies — `electron-updater`, `express`,
`express-rate-limit` — are MIT/Apache-2.0. Everything else in `package.json` is
a `devDependency`.

## MPL-2.0: lightningcss

`lightningcss@1.32.0` and its per-platform native binaries
(`lightningcss-darwin-arm64`, `-darwin-x64`, `-android-arm64`, `-freebsd-x64`,
`-linux-arm-gnueabihf`, `-linux-arm64-gnu`, `-linux-arm64-musl`,
`-linux-x64-gnu`, `-linux-x64-musl`, `-win32-arm64-msvc`, `-win32-x64-msvc`)
are MPL-2.0. A license scan flags them for review, so here is the review.

**How it gets here.** It is a transitive `devDependency`, reached two ways:

```
ea-pos
├── @tailwindcss/vite → @tailwindcss/node → lightningcss
└── vite → lightningcss
```

`npm ls --omit=dev lightningcss` returns empty. It is a build-time CSS
transformer, not something the application calls.

**Whether it is distributed.** It is not.
`electron-builder.config.cjs` packages `files: ['dist/**/*', 'electron/**/*']`
— the compiled bundle and the Electron main process. No `node_modules` tree is
packaged, so no MPL-covered file is shipped in the installer, the portable
build, or the browser bundle. What ships is CSS that lightningcss _processed_,
which is this project's own stylesheet output and not a derivative of the
transformer.

**What MPL-2.0 would require if it were shipped.** MPL-2.0 is file-level
copyleft (§3.1–§3.3): distributing a modified MPL-covered _file_ obliges you to
publish that file's source under MPL. It does not reach the code that merely
uses the library, whether linked or bundled. This project does not modify
lightningcss.

**One correction.** License scanners frequently list "network use clause" among
MPL-2.0's concerning terms. MPL-2.0 has no network-use or SaaS provision —
that is AGPL-3.0 §13. MPL-2.0 obligations trigger on _distribution_ of covered
files, and nothing here distributes any.

**Disposition: accepted, no action required.** No attribution obligation
arises, because there is nothing to attribute in what is distributed. Revisit
this only if lightningcss moves into `dependencies`, or if the packaged file
list is widened to include `node_modules`.

## Re-reviewing

Two conditions warrant a fresh look:

- A new package lands under a copyleft license (GPL/LGPL/AGPL/MPL/EPL/CDDL).
  Strong copyleft — GPL and AGPL especially — is a different question from the
  weak copyleft above and should not be waved through on this precedent.
- The Electron packaging changes what it ships. The conclusion above rests on
  `files` covering only `dist/` and `electron/`.

To re-derive the license census:

```bash
npm ci
npx license-checker --summary   # or any SPDX-aware SBOM tool
npm ls --omit=dev <package>     # confirms whether a package is shipped at all
```
