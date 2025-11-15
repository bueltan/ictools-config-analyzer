# 📊 ICTools Config Analyzer

## Overview

ICTools Config Analyzer is a Visual Studio Code extension that validates configuration files used by ICTools to manage and deploy development environments. These include:

* **ic-source-code.yml**
  Describes Git repositories and branches to check.

* **pip-config.yml**
  Defines Python package dependencies for various DCC (Digital Content Creation) tools like Blender, Maya, Unreal, and Mari.

The extension provides a UI inside VSCode using a WebView and performs validations using Node-based logic executed in the extension backend.

---

## Architecture Summary

### 🔹 Backend (Extension Host)

Written in TypeScript, responsible for:

| Module              | Purpose                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| `extension.ts`      | Core orchestrator: UI ↔ backend communication, YAML parsing, validation execution |
| `gitValidator.ts`   | Git ref validation using `git ls-remote`                                          |
| `cmdRunner.ts`      | Command execution with retry behavior and manual timeouts                         |
| `perHostLimiter.ts` | Throttled concurrency by Git host                                                 |
| `utilsHost.ts`      | URL parsing to extract hostnames                                                  |
| `models.ts`         | Shared data structures for repositories, configs, packages                        |
| `consts.ts`         | Global constants and YAML field names                                             |

Back-end responsibilities:

* Reads configuration folders selected by the user.
* Extracts both repository and Python dependency structures.
* Performs:

  * Git branch/tag existence checks
  * Package version availability checks against Python index
* Sends incremental results back to the WebView.

---

### 🔹 Frontend (Media Folder: WebView UI)

Files under **media/**:

| File                  | Purpose                                                 |
| --------------------- | ------------------------------------------------------- |
| `configAnalyzer.html` | UI layout with sections/tables                          |
| `configAnalyzer.css`  | VSCode-themed styling and responsive tables             |
| `configAnalyzer.js`   | State management, event handlers, message communication |

UI features:

* Shows parsed repos and PIP configs in two searchable tables
* Per-row actions:

  * Run
  * Run all
* Status representation:

  * “Not validated”
  * “OK” / “Missing” / “Access error”
  * (New) ⏳ loading state
* Shows package-level validation for each PIP config

All validation occurs in the backend, while the UI responds reactively to incoming messages.

---

## Data Flow

```
┌────────────────────┐             ┌─────────────────────────┐
│ User Interaction   │             │ VSCode Backend          │
│ (Buttons clicked)  │ ─▶ postMsg ▶│ extension.ts            │
└────────────────────┘             │                         │
                                   │ - Parse config files    │
                                   │ - Launch validation     │
                                   │ - Send progress events  │
                                   └─────────┬───────────────┘
                                             │ message events
                                             ▼
                                   ┌─────────────────────────┐
                                   │ WebView UI (JS)         │
                                   │ - Update table rows     │
                                   │ - Display live results  │
                                   └─────────────────────────┘
```

---

## 1. Webview “media” files

### `configAnalyzer.html` 

This is the **webview shell**:

* Declares CSP with `${cspSource}` and `${nonce}`.
* Links one CSS file (`${styleUri}`) and one JS file (`${scriptUri}`).
* Main layout:

  * Header: **“ICTools Config Analyzer”**.
  * Toolbar:

    * `Select configuration folder` button (`#pick-folder`).
    * Text span `#folder-path` showing the current folder.
  * `#status` area for short status messages.
* **Source Code Repositories section**:

  * `Run all` button (`#run-all-repos`).
  * Table `#source-repos-body` with columns: `#`, `Name`, `Git URL`, `Ref`, `Status`, `Last check`, `Action`.
* **PIP Configurations section**:

  * `Run all` button (`#run-all-pip-configs`).
  * Table `#pip-configs-body` with columns: `#`, `DCC`, `Version`, `Path`, `Packages`, `Status`, `Last check`, `Action`.
* **Packages section**:

  * Hidden by default (`#packages-section`).
  * Appears when a PIP config is selected and shows individual package status in `#packages-body`.

So: HTML = structure + IDs that the JS uses to populate everything.

---

### `configAnalyzer.css` 

This is the **VSCode-themed styling**:

* Uses VSCode theme variables (`--vscode-*`) for colors and fonts.
* Layout:

  * `body` with VSCode font, editor background, small font-size.
  * `.toolbar` as a flex row with buttons and folder path.
* Buttons:

  * Use VSCode button colors; hover state maps to `--vscode-button-hoverBackground`.
* Misc:

  * `#folder-path` is monospace with low opacity.
  * `.summary` and `.chip` for potential summary “pills” (not yet used in HTML).
* Table styling:

  * `.table-wrapper` with scroll, border and sticky `<thead>`.
  * Zebra rows via `tbody tr:nth-child(odd)`.
* Severity classes:

  * `.severity-info`, `.severity-missing`, `.severity-access_error` ready for color-coding (currently not wired in the JS, but available).

So: CSS = themed, scrollable tables, ready for severity color classes.

---

### `configAnalyzer.js` 

This is the **webview controller**:

**State:**

* `sourceRepos`: array of `{ name, git_url, git_ref, status?, severity?, lastTimestamp? }`
* `pipConfigs`: array of `PiPConfigInfo` + UI fields `{ overallStatus?, lastTimestamp? }`
* `selectedPipConfig`: currently selected PIP config.
* `currentPackages`: packages of that selected config `{ name, type, url, version, status }`.

**Helpers:**

* `decorateStatus(status)`: returns strings with emojis:

  * `⏺️ Not validated`, `✅ OK ...`, `❌ missing ...` / `access error`, or `⚠️ ...`.
* `decorateOverallStatus(overallStatus)`: `⏺️`, `✅ All OK`, `❌ Issues found`, or raw.

**Rendering functions:**

* `renderSourceRepos()`:

  * Clears `#source-repos-body`.
  * For each repo: renders row with index, name, url, ref, decorated status, lastTimestamp (as `toLocaleString()`), and **an Action “Run” button**.
  * “Run” button posts message `{ type: 'runSingleRepo', payload: { name } }` to the extension.
  * Enables / disables `runAllReposBtn` depending on array length.

* `renderPipConfigs()`:

  * Clears `#pip-configs-body`.
  * For each config: index, DCC, version, path, number of packages, decorated overallStatus, lastTimestamp, and an Action “Run” button.
  * “Run” button calls `onRunPipConfig(cfg)`.

* `onRunPipConfig(cfg)`:

  * Sets `selectedPipConfig`, clones its `packages` into `currentPackages` with initial `status`.
  * Shows `#packages-section` and sets title `Packages in "<dccName>"`.
  * Calls `renderPackagesTable()`.
  * Posts `{ type: 'runPipConfig', payload: { pipConfigPath } }` to the extension.

* `renderPackagesTable()`:

  * Renders `currentPackages` into `#packages-body`: index, name, type, url, version, decorated status.

**Event wiring:**

* `#pick-folder` click → `{ type: 'pickFolder' }`.
* `#run-all-repos` click → `{ type: 'runAllSourceRepos' }` (if there are repos).
* `#run-all-pip-configs` click → `{ type: 'runAllPipConfigs' }` (if there are configs).

**Message handling from extension:**

`window.addEventListener('message', ...)` handles:

* `folderSelected`: update path label, clear state and tables, hide packages section.
* `status`: set text in `#status`.
* `sourceCodeRepos`: feed `sourceRepos` with “Not validated” status and no timestamps, then render.
* `repoStatus`: update one repo by `name` with new `status`, `severity`, `timestamp`, then re-render.
* `pipConfigs`: feed `pipConfigs` with `overallStatus = 'Not validated'`, then render.
* `pipPackageStatus`: update one package in `currentPackages` for selected config (by `pipConfigPath` and `pkgName`), then re-render package table.
* `pipConfigSummary`: update one config’s `overallStatus` (`All OK` / `Issues found`) and `lastTimestamp`, then re-render.

So: the JS is a pure **view + controller for the panel**, and all heavy work is done in the extension back-end through `postMessage`.

---

## 2. Core TypeScript modules (back-end side)

### `models.ts`

Defines shared **TypeScript interfaces** used by the extension code (and essentially mirrored by the JS):

* `PackageInfo`: name, type, url, version, optional `valid`, `errorMessage`, `timestamp`, `status`.
* `PiPConfigInfo`: `dccName`, `dccVersion`, `pipConfigPath`, `packages: PackageInfo[]`, optional `overallStatus` and `lastTimestamp`.
* Backend flavors `Package` and `Repository` that map to what is parsed from YAML (snake_case `error_message` etc.) so you can adapt file content to UI models.

These models are what `extension.ts` uses and what it sends into the webview.

---

### `consts.ts`

Holds **config constants**:

* Filenames and subfolders:

  * `DCC_VENV_CONFIG_FILE_NAME: 'pip-config.yml'`
  * `SOURCE_CODE: 'ic-source-code.yml'`
  * `SUB_FOLDER_VENV_CONFIGS: 'tools/venv-configs'`
* Behavior knobs:

  * `MAX_REQUESTS_PER_HOST` (for Git checks).
  * `TIMEOUT_GIT_REF_CHECK` in seconds.
  * `SCAN_REPO` flag (to allow full `ls-remote` scan).
  * `PARALLEL_JOBS` global cap for concurrent jobs.
* `PIPConfigFileKeys` and `ICSourceCodeFileKeys` define the YAML keys for packages / repos, so you avoid magic strings sprinkled everywhere.

---

### `utilsHost.ts`

Tiny but important helper:

* `hostFromUrl(url: string): string`

  * For HTTP/S URLs: uses `new URL(url)` and returns `hostname`.
  * For SSH-like `git@git.ictools.io:owner/repo.git` it splits and returns `git.ictools.io`.
  * Returns `'unknown'` if parsing fails.

This is what allows per-host limiting (e.g. so you don’t DoS `git.ictools.io`).

---

### `perHostLimiter.ts`

Implements **per-host concurrency control**:

* `Semaphore`:

  * Tracks available “slots”.
  * `acquire()` waits when `available === 0`, queueing resolvers.
  * `release()` frees and wakes next queued waiter.

* `PerHostLimiter`:

  * Keeps a map `host -> Semaphore`.
  * `acquire(host)`:

    * Gets or creates a semaphore for that host.
    * Awaits its `acquire()`.
  * `release(host)`:

    * Releases the host’s semaphore.

This is meant to wrap calls like `checkRefFast` so that you respect `MAX_REQUESTS_PER_HOST` per Git host.

---

### `cmdRunner.ts`

Wrapper around **`child_process.spawn`** with retry logic:

* Types:

  * `CmdResult { rc, stdout, stderr }`
  * `CmdRunOptions { cwd?, env?, timeoutMs?, retries? }`

* Main responsibilities:

  * Run external commands (e.g. `git ls-remote ...`).
  * Implement **retries** for “transient” network-like errors.
  * Distinguish transient vs non-transient by scanning `stderr` for patterns like:

    * Transient: “operation timed out”, “connection reset”, etc.
    * Non-transient: “permission denied”, “authentication failed”, etc.
  * Apply a **manual timeout** with `setTimeout` that kills the process and appends a message to `stderr`.

`gitValidator.ts` relies on this so that a flaky network doesn’t instantly mark a repo as permanently broken.

---

### `gitValidator.ts`

Responsible for **git ref validation**:

* `RepoRefStatus { ok, status, rawError? }`.
* `normalizeShortRef(gitRef: string)`: strips `refs/heads/` or `refs/tags/`.
* `checkRefFast(gitUrl, gitRef, timeoutSeconds, allowScan)`:

  * Builds refspecs: `refs/heads/<short>`, `refs/tags/<short>`, `<short>`.
  * Uses `CmdRunner` to run `git ls-remote <url> <refspecs...>` with the given timeout.
  * If `rc != 0` → returns `ok=false`, `status="access error: ..."` with `rawError`.
  * If ok:

    * Parses stdout; if the desired ref shows up, returns `ok=true` with a friendly status.
    * If not found and `allowScan` is `true`, does a full `ls-remote` (no refspecs) and scans all refs for matches.
    * Otherwise returns some “missing” status.

This is the TypeScript port of the Python function we discussed earlier in `ic-configuration-manager`.

---

### `extension.ts`

This is the **VSCode extension entrypoint** and glue:

* Activates command(s) (`ictools-config-analyzer.openPanel` or similar).
* Creates the webview panel and loads `configAnalyzer.html` with the proper `nonce`, `styleUri`, `scriptUri`.
* Uses `fs` + `path` + `yaml` to:

  * Discover `ic-source-code.yml` and `pip-config.yml` inside the selected configuration folder.
  * Parse those into `Repository[]`, `PiPConfigInfo[]` using the key constants from `consts.ts`.
  * Infer `dccName` and `dccVersion` from the folder structure for PIP configs.
* Listens to webview messages:

  * `pickFolder`: opens folder picker, scans for configs, sends `sourceCodeRepos` and `pipConfigs`.
  * `runSingleRepo` / `runAllSourceRepos`:

    * Uses `checkRefFast` + `PerHostLimiter` + `hostFromUrl`.
    * Emits `repoStatus` messages (with severity, timestamps) as results arrive.
  * `runAllPipConfigs` / `runPipConfig`:

    * For each package, performs HTTP checks against the configured index URL.
    * Uses helpers:

      * `pep503Normalize(name)` to canonicalize project names.
      * `versionExistsInHtml(html, project, wanted)` to parse simple index HTML and decide if the version exists.
    * Emits:

      * `pipPackageStatus` per package.
      * `pipConfigSummary` at the end with `anyIssues` and timestamp.

So `extension.ts` is the orchestrator between VSCode, your YAML configs, `gitValidator`, and the webview UI.

---

## TL;DR

* **Back-end TS modules**: parse config files, run git/HTTP checks, manage concurrency and retries, and send structured messages to the webview.
* **Front-end media files**: render tables and buttons, maintain UI state, and talk to the extension via `postMessage`.
