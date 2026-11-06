# Saved Prompts Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Paseo plugin that stores named prompts (locally on the host or in a self-hosted
Langfuse) and lets the user attach one to the first message of a new workspace.

**Architecture:** A standard Paseo plugin with both runtimes. Shared Zod contracts and settings
documents live in `shared/`. The server runtime answers three RPCs (`prompts.search`,
`prompts.list`, `prompts.langfuse.test`) and is the only code that reads the Langfuse key file
or calls Langfuse. The client registers an attachment source, a sidebar item, a Prompts screen,
and a settings screen; it writes local prompts directly through `useSettings(...).save`.

**Tech Stack:** TypeScript, React Native primitives, `@getpaseo/plugin` (Paseo 0.15), Zod 4,
TanStack Query 5, Vitest 4, Node 24 (`fetch`, `node:fs/promises`).

**Spec:** `docs/superpowers/specs/2026-11-06-saved-prompts-design.md`

**Deviations from the spec:** `prompts.get` is dropped because `prompts.list` already returns
each prompt's text. Key file tests use a real temp directory instead of a mocked filesystem.

**Paseo API reference:** `/home/stephane/dev-perso/paseo/public-docs/plugins/reference.md`
(read the sections named in each task). Working examples:
`/home/stephane/dev-perso/paseo/plugin-examples/linear` (attachment source, stub-server tests) and
`/home/stephane/dev-perso/paseo/plugin-examples/settings` (settings documents and screens).

## Global Constraints

- Plugin id `saved-prompts`; display name `Saved Prompts`; `requirements.paseo` `">=0.15.0"`.
- Storage modes `local` (default) and `langfuse`; exactly one active, no fallback between them.
- Langfuse label default `production`.
- Key file default path `~/.config/paseo-saved-prompts/langfuse.env`; lines
  `LANGFUSE_PUBLIC_KEY=...` and `LANGFUSE_SECRET_KEY=...`; read on every Langfuse request.
- Key file readable by group or others (mode `& 0o077 !== 0`) is refused on non-Windows platforms.
- Key values are never logged, never returned to the client, never stored in settings.
- Only Langfuse prompts with `type: "text"` are listed; `chat` prompts are skipped.
- No `{{variable}}` substitution; prompt text is sent as written.
- Attachment `resourceType` is `"prompt"`.
- Client code: React Native primitives only (`View`, `Text`, `Pressable`, `ScrollView`,
  `TextInput`), no DOM, no `className`, no `onClick`; every `Text` color from `theme.colors`;
  padding from `layout.compact`.
- Import boundaries: `client/` never imports `server/`; `server/` never imports `client/`;
  `shared/` imports neither Node nor React Native APIs; no code modules in the plugin root except
  `index.client.tsx` and `index.server.ts`.
- Never restart the Paseo daemon. Use `paseo plugin reload saved-prompts`.
- User rules: types at every boundary, Zod validation of Langfuse responses, specific error
  classes documented in doc comments, no silent catches, conventional commit messages, no AI
  attribution in commits.

## Review Focus

1. Langfuse base URL entered with a trailing slash or a path (`https://lf.example.com/`) still
   produces correct API URLs. Test in Task 4.
2. Prompt names with spaces, slashes, or unicode (`release / hotfix`) are URL-encoded when fetched
   and still match search. Test in Task 4.
3. A Langfuse instance with more than one page of prompts lists all of them. Test in Task 4.
4. A local prompt name that differs only by case or surrounding spaces from an existing one is
   rejected as a duplicate. Test in Task 2.
5. The key file has CRLF line endings, comments, blank lines, or quoted values. Test in Task 3.

---

### Task 1: Project scaffold and repository

**Files:**
- Create (via `paseo plugin init`): `paseo-plugin.json`, `OVERVIEW.md`, `package.json`,
  `tsconfig.json`, `index.client.tsx`, `index.server.ts`, `client/web.ts`
- Delete: the scaffold's `client/greeting.tsx`, `server/greeting.ts`, `shared/greeting.ts`
- Create: `.gitignore` (`node_modules/`), `vitest.config.ts`

**Interfaces:**
- Produces: `npm run typecheck` and `npm test` scripts used by every later task.

- [ ] **Step 1: Initialize git.** In `/home/stephane/dev-perso/paseo-saved-prompts` run
  `git init -b main`. The folder already holds `docs/`.
- [ ] **Step 2: Scaffold.** Run `paseo plugin init /home/stephane/dev-perso/paseo-saved-prompts`.
  If it refuses the non-empty folder, run it into `/tmp/saved-prompts-scaffold` and copy the
  generated files across. Expected: the files listed above exist.
- [ ] **Step 3: Edit manifest.** `paseo-plugin.json`: `"id": "saved-prompts"`,
  `"name": "Saved Prompts"`, `"requirements": { "paseo": ">=0.15.0" }`.
- [ ] **Step 4: Edit `package.json`.** Add devDependencies `vitest` `^4.1.6` and `@types/node`
  `^24`; add script `"test": "vitest run"`. In `tsconfig.json` set `"types": ["react", "node"]`.
- [ ] **Step 5: Strip the greeting sample.** Delete the three greeting files; reduce both entries
  to a `contribute` function that registers nothing and returns `() => {}`.
- [ ] **Step 6: Install and verify.** Run `npm install && npm run typecheck`. Expected: exit 0.
  `npm test` with no tests: add `passWithNoTests: true` in `vitest.config.ts` so it exits 0.
- [ ] **Step 7: Commit.**
  `git add -A && git commit -m "chore: scaffold saved-prompts paseo plugin"`

---

### Task 2: Shared contracts, settings documents, and local prompt editing

Read reference.md sections "Persisted values" and "Add a composer attachment source".

**Files:**
- Create: `shared/settings.ts`, `shared/prompts.ts`, `shared/local-prompts.ts`
- Test: `tests/local-prompts.test.ts`, `tests/prompts.test.ts`

**Interfaces:**
- Produces, `shared/settings.ts`:
  - `configSettings = defineSettings({ id: "config", scope: "host", version: 1, schema: ConfigSchema })`
  - `ConfigSchema = z.object({ mode: z.enum(["local","langfuse"]).default("local"), langfuseBaseUrl: z.string().trim().default(""), langfuseLabel: z.string().trim().min(1).default("production"), keyFilePath: z.string().trim().min(1).default("~/.config/paseo-saved-prompts/langfuse.env") })`;
    `type Config = z.infer<typeof ConfigSchema>`
  - `LocalPromptSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(80), description: z.string().trim().max(200).optional(), text: z.string().refine(t => t.trim().length > 0), updatedAt: z.string() })`;
    `type LocalPrompt`
  - `localPromptsSettings = defineSettings({ id: "local-prompts", scope: "host", version: 1, schema })`
    where the schema is `z.object({ prompts: z.array(LocalPromptSchema).default([]) })` with a
    `superRefine` rejecting duplicate names compared by `name.trim().toLowerCase()`.
- Produces, `shared/prompts.ts`:
  - `SavedPromptSchema = z.object({ id, name, description?: string, text, version?: number, url: z.url() })`; `type SavedPrompt`
  - `searchPromptsRpc = defineRpc({ name: "prompts.search", input: z.object({ query: z.string() }), output: PluginAttachmentSearchPayloadSchema })`
  - `listPromptsRpc = defineRpc({ name: "prompts.list", input: z.object({}), output: z.object({ mode: z.enum(["local","langfuse"]), prompts: z.array(SavedPromptSchema) }) })`
  - `testLangfuseRpc = defineRpc({ name: "prompts.langfuse.test", input: z.object({}), output: z.object({ projectName: z.string() }) })`
  - `promptsSource = defineAttachmentSource({ id: "saved-prompts", title: "Saved prompt", icon: "BookText", pickerTitle: "Attach saved prompt", searchPlaceholder: "Search prompts by name", search: searchPromptsRpc })`
  - `toAttachmentItem(prompt: SavedPrompt, subtitle?: string): PluginAttachmentItem`: `id`,
    `identifier` = `name`, `title` = `name`, `subtitle`, `url`, `text`, `resourceType: "prompt"`.
  - `localPromptUrl(id: string): string` returns `paseo-saved-prompts://local/<encodeURIComponent(id)>`.
- Produces, `shared/local-prompts.ts` (pure, used by the client editor):
  - `interface PromptDraft { name: string; description: string; text: string }`
  - `validatePromptDraft(draft: PromptDraft, existing: LocalPrompt[], editingId: string | null): string[]`
    returns error messages: `"Enter a name"`, `"Name is already used"`, `"Enter the prompt text"`.
  - `upsertPrompt(prompts: LocalPrompt[], draft: PromptDraft, opts: { editingId: string | null; newId: string; now: string }): LocalPrompt[]`
    trims name and description (empty description becomes `undefined`), keeps text as written.
  - `deletePrompt(prompts: LocalPrompt[], id: string): LocalPrompt[]`

- [ ] **Step 1: Write failing tests.** `tests/local-prompts.test.ts`:
  - `validatePromptDraft` returns `["Enter a name"]` for name `"  "`; `["Enter the prompt text"]`
    for text `"\n "`; `["Name is already used"]` for `" pr review "` when `"PR Review"` exists;
    `[]` when editing that same prompt's id with the same name.
  - `upsertPrompt` with `editingId: null` appends `{ id: newId, updatedAt: now, ... }`; with an
    existing id replaces in place and keeps order; description `""` becomes `undefined`.
  - `deletePrompt` removes only the matching id.
  - `localPromptsSettings.schema.safeParse` fails for two prompts named `"Triage"` and
    `" triage"`, and succeeds for `{}` with `prompts: []`.

  `tests/prompts.test.ts`:
  - `toAttachmentItem` passes `PluginAttachmentItemSchema.parse` for a prompt whose url is
    `localPromptUrl("a b/c")` (proves the custom scheme passes `z.url()`).
  - `configSettings.schema.parse({})` equals `{ mode: "local", langfuseBaseUrl: "", langfuseLabel: "production", keyFilePath: "~/.config/paseo-saved-prompts/langfuse.env" }`.
- [ ] **Step 2: Run** `npx vitest run tests/local-prompts.test.ts tests/prompts.test.ts`.
  Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** the three shared modules with the signatures above. If
  `localPromptUrl` fails `z.url()`, switch to `https://saved-prompts.invalid/local/<id>` and update
  the test.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then `npm run typecheck`: exit 0.
- [ ] **Step 5: Commit.** `git commit -m "feat: add shared prompt contracts and settings"`

---

### Task 3: Langfuse key file reader

**Files:**
- Create: `server/key-file.ts`
- Test: `tests/key-file.test.ts`

**Interfaces:**
- Produces:
  - `interface LangfuseKeys { publicKey: string; secretKey: string }`
  - `class KeyFileError extends Error` with readonly `reason: "missing" | "unreadable" | "too-open" | "missing-key"`,
    `path: string`, `key?: "LANGFUSE_PUBLIC_KEY" | "LANGFUSE_SECRET_KEY"`. Messages:
    - missing: `Langfuse key file not found at <path>.`
    - unreadable: `Cannot read Langfuse key file at <path>: <code>.`
    - too-open: `Langfuse key file <path> is readable by other users. Run: chmod 600 <path>`
    - missing-key: `Langfuse key file <path> has no <KEY> line.`
  - `readLangfuseKeys(path: string, opts?: { homeDir?: string; platform?: NodeJS.Platform }): Promise<LangfuseKeys>`
    expands a leading `~` with `opts.homeDir ?? os.homedir()`; checks `stat().mode & 0o077` unless
    platform is `win32`; parses `KEY=value` lines, ignoring blank lines and `#` comments, trimming
    CR and whitespace, stripping one pair of surrounding single or double quotes.

- [ ] **Step 1: Write failing tests** using a real temp directory (`fs.mkdtemp(os.tmpdir())`),
  files written with mode `0o600` unless the test says otherwise:
  - valid file with CRLF endings, a comment, a blank line and a quoted secret returns both keys.
  - `~/keys.env` resolves against `homeDir` set to the temp dir.
  - absent file rejects with `reason: "missing"`.
  - mode `0o644` rejects with `reason: "too-open"`; same file with `platform: "win32"` resolves.
  - file without the secret line rejects with `reason: "missing-key"`, `key: "LANGFUSE_SECRET_KEY"`.
  - no error message contains the secret value.
- [ ] **Step 2: Run** `npx vitest run tests/key-file.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `server/key-file.ts`. Map `ENOENT` to `missing`, other `stat`/`read`
  errors to `unreadable` with the error code.
- [ ] **Step 4: Run** the test. Expected: PASS. `npm run typecheck`: exit 0.
- [ ] **Step 5: Commit.** `git commit -m "feat: read langfuse keys from a protected key file"`

---

### Task 4: Langfuse client

Before implementing, confirm the endpoints against the user's self-hosted Langfuse API reference
(`<baseUrl>/api/public` docs or langfuse.com/docs/api). Expected shapes, which the tests encode:
- `GET /api/public/v2/prompts?label=<label>&page=<n>&limit=50` returns
  `{ data: [{ name: string, ... }], meta: { page: number, totalPages: number } }`.
- `GET /api/public/v2/prompts/<encodeURIComponent(name)>?label=<label>` returns
  `{ name, version: number, type: "text" | "chat", prompt: string | unknown[] }`.
- `GET /api/public/projects` returns `{ data: [{ id: string, name: string }] }`.
- Auth: HTTP basic, public key as user, secret key as password.
If the real API differs, adjust the Zod schemas and the stub server together and note it in the
commit message.

**Files:**
- Create: `server/langfuse.ts`
- Test: `tests/langfuse.test.ts`

**Interfaces:**
- Consumes: `LangfuseKeys` (Task 3), `SavedPrompt` (Task 2).
- Produces:
  - `class LangfuseError extends Error` with readonly `kind: "config" | "auth" | "http" | "network" | "invalid-response"`
    and `status?: number`. Messages:
    - config: `Set the Langfuse base URL in plugin settings.`
    - auth: `Langfuse rejected the keys (HTTP <status>).`
    - http: `Langfuse request failed (HTTP <status>).`
    - network: `Cannot reach Langfuse at <baseUrl>: <cause message>.`
    - invalid-response: `Langfuse returned an unexpected response.` (Zod issue logged with
      `console.error`, never the keys)
  - `interface LangfuseClient { listTextPrompts(label: string): Promise<SavedPrompt[]>; testConnection(): Promise<{ projectName: string }> }`
  - `createLangfuseClient(opts: { baseUrl: string; keys: LangfuseKeys; fetchImpl?: typeof fetch }): LangfuseClient`
  - `SavedPrompt` mapping: `id` = `<name>@<version>`, `name`, `text` = `prompt`, `version`,
    `url` = `<origin-and-path>/project/<projectId>/prompts/<encodeURIComponent(name)>`, using the
    first project from `/api/public/projects`.

- [ ] **Step 1: Write failing tests** against a local `node:http` stub server (pattern:
  `/home/stephane/dev-perso/paseo/plugin-examples/linear/linear.test.ts`), real `fetch`:
  - two list pages (`totalPages: 2`) with prompts `"PR review"`, `"release / hotfix"`, and a chat
    prompt `"triage-chat"`: result has the two text prompts only, with correct text, version,
    id, and url; the stub saw `label=production` on every request, the encoded path
    `release%20%2F%20hotfix`, and a `Basic` header decoding to `pk:sk`.
  - `baseUrl` with a trailing slash yields the same request paths.
  - empty `baseUrl` rejects with `kind: "config"` and makes no request.
  - stub returns 401: `kind: "auth"`, `status: 401`. Returns 500: `kind: "http"`.
  - stub returns `{ data: "nope" }`: `kind: "invalid-response"`.
  - `baseUrl` pointing at a closed port: `kind: "network"`.
  - `testConnection` returns the first project's name.
- [ ] **Step 2: Run** `npx vitest run tests/langfuse.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `server/langfuse.ts`. Normalize the base URL by stripping trailing
  slashes. Fetch prompt details in parallel after collecting all list pages.
- [ ] **Step 4: Run** the test. Expected: PASS. `npm run typecheck`: exit 0.
- [ ] **Step 5: Commit.** `git commit -m "feat: add langfuse prompt client"`

---

### Task 5: Prompt service and server entry

**Files:**
- Create: `server/prompt-service.ts`
- Modify: `index.server.ts`
- Test: `tests/prompt-service.test.ts`

**Interfaces:**
- Consumes: `Config`, `LocalPrompt`, `configSettings`, `localPromptsSettings`, the three RPCs,
  `toAttachmentItem`, `localPromptUrl` (Task 2); `readLangfuseKeys` (Task 3);
  `createLangfuseClient` (Task 4).
- Produces:
  - `interface PromptServiceDeps { readConfig(): Promise<Config>; readLocalPrompts(): Promise<LocalPrompt[]>; readKeys(path: string): Promise<LangfuseKeys>; createLangfuse(opts: { baseUrl: string; keys: LangfuseKeys }): LangfuseClient }`
  - `createPromptService(deps: PromptServiceDeps): { list(): Promise<{ mode: Config["mode"]; prompts: SavedPrompt[] }>; search(query: string): Promise<PluginAttachmentSearchPayload>; testLangfuse(): Promise<{ projectName: string }> }`
  - `class SettingsUnavailableError extends Error` thrown when a settings `read()` returns
    `invalid`, with message `Saved Prompts settings are invalid: <error>`.
- Behavior:
  - `list`: local mode maps each `LocalPrompt` to `SavedPrompt` with `localPromptUrl(id)`;
    langfuse mode reads keys from `config.keyFilePath`, then `listTextPrompts(config.langfuseLabel)`.
    Results sorted by name, case-insensitive.
  - `search`: `list()`, keep prompts whose name contains the trimmed query case-insensitively
    (empty query keeps all), first 50, mapped with `toAttachmentItem`. Subtitle: local uses the
    description; langfuse uses `v<version> · <label>`.
  - `testLangfuse`: reads keys and calls `testConnection` regardless of the active mode.
  - Errors from Tasks 3 and 4 propagate unchanged so their messages reach the user.

- [ ] **Step 1: Write failing tests** with in-memory fake deps:
  - local mode: `search("pr")` returns `PR review` but not `Release`; `search("")` returns all,
    sorted; items carry `resourceType: "prompt"` and the description as subtitle.
  - langfuse mode: `readKeys` is called with `config.keyFilePath`; `listTextPrompts` with
    `"production"`; subtitle is `v3 · production`.
  - langfuse mode with `readKeys` rejecting a `KeyFileError`: `search` rejects with that same error.
  - 60 local prompts all matching: `search` returns 50.
- [ ] **Step 2: Run** `npx vitest run tests/prompt-service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `server/prompt-service.ts`.
- [ ] **Step 4: Wire `index.server.ts`.** Register both settings documents with
  `server.registerSettings`; build real deps (`read()` -> `values` when `ready`, else throw
  `SettingsUnavailableError`); `server.handle` the three RPCs. Return `() => {}`.
- [ ] **Step 5: Run** the test and `npm run typecheck`. Expected: PASS, exit 0.
- [ ] **Step 6: Commit.** `git commit -m "feat: serve saved prompts over plugin rpc"`

---

### Task 6: Attachment source, install, and end-to-end check

**Files:**
- Modify: `index.client.tsx`

**Interfaces:**
- Consumes: `promptsSource` (Task 2), server RPCs (Task 5).

- [ ] **Step 1: Register** `client.addAttachmentSource(promptsSource)` in `index.client.tsx`.
- [ ] **Step 2: Typecheck.** `npm run typecheck`. Expected: exit 0.
- [ ] **Step 3: Install.** `paseo plugin install /home/stephane/dev-perso/paseo-saved-prompts`,
  then `paseo plugin ls`. Expected: `saved-prompts` `running`, no error. On failure read
  `paseo plugin logs saved-prompts`.
- [ ] **Step 4: Check the empty picker.** No editor exists yet. In the New workspace composer,
  Attach -> Saved prompt opens a picker with no results and no error.
- [ ] **Step 5: Commit.** `git commit -m "feat: attach saved prompts from the composer"`

---

### Task 7: Prompts screen with local editing and Langfuse browsing

Read reference.md sections "Screens and sidebar items", "Sidebar items", "Theme and layout",
"Persisted values", and "Modal" (for delete confirmation).

**Files:**
- Create: `client/prompts-screen.tsx`, `client/prompt-editor.tsx`, `client/prompt-list.tsx`,
  `client/prompts-sidebar-item.tsx`
- Modify: `index.client.tsx`

**Interfaces:**
- Consumes: `configSettings`, `localPromptsSettings`, `listPromptsRpc`, `validatePromptDraft`,
  `upsertPrompt`, `deletePrompt`, `PromptDraft` (Task 2).
- Produces: screen id `"prompts"`, sidebar header item id `"prompts"` (icon `"BookText"`, title
  `"Prompts"`), registered with `client.addScreen` and `client.addSidebarHeaderItem`.
- Behavior:
  - Header line: `Local prompts on <host.label>` or `Langfuse prompts (<label>)`, plus a
    `Settings` action calling `client.openSettings("config")`.
  - Data: `useRpc(listPromptsRpc)` through TanStack `useQuery`, key `["prompts", mode]`;
    invalidate after every local save. Langfuse mode shows a `Refresh` action that refetches.
  - Error state renders the RPC error message in `theme.colors.foreground` with a `Retry` action.
  - Local mode: `New prompt` button; tapping a row opens the editor; editor saves with
    `upsertPrompt` + `settings.save(values, revision)`, keeping the revision captured when the
    editor opened; shows `validatePromptDraft` errors and `settings.saveError`; delete asks for
    confirmation then saves `deletePrompt`. New ids: `` `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` ``.
  - Langfuse mode: rows are read-only; tapping one shows the full text, name, and version.
  - Empty state: local `No saved prompts yet.`; langfuse `No text prompts with label <label>.`

- [ ] **Step 1: Build** the four client files and register the screen and sidebar item.
- [ ] **Step 2: Audit.** Run
  `rg -n "document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=" client/`.
  Expected: hits only in `client/web.ts`.
- [ ] **Step 3: Typecheck and reload.** `npm run typecheck && paseo plugin reload saved-prompts && paseo plugin ls`.
  Expected: exit 0, `running`.
- [ ] **Step 4: Manual check, local mode.** Create `PR review` and `Triage`; edit one; try a
  duplicate name (rejected); delete one. In New workspace, attach `PR review` with a Claude agent
  and send with no typed text; the agent's first message shows the prompt text. Repeat with Codex.
- [ ] **Step 5: Manual check, layout.** Narrow the window to compact width and switch to a dark
  theme; all text stays readable.
- [ ] **Step 6: Commit.** `git commit -m "feat: add prompts screen with local editing"`

---

### Task 8: Settings screen and Langfuse end-to-end

Read reference.md section "Settings screens" and the example
`/home/stephane/dev-perso/paseo/plugin-examples/settings/client/display-settings.tsx`.

**Files:**
- Create: `client/settings-screen.tsx`
- Modify: `index.client.tsx`

**Interfaces:**
- Consumes: `configSettings`, `testLangfuseRpc` (Task 2).
- Produces: settings screen id `"config"`, title `"Storage"`, icon `"Database"`, registered with
  `client.addSettingsScreen`.
- Behavior: `SettingsSelect` for mode (`Local`, `Langfuse`); `SettingsInput` for base URL, label,
  and key file path; one `Save` action using the draft-plus-revision pattern from the example;
  `Test connection` action calling `testLangfuseRpc` and showing `Connected to <projectName>` or
  the error message; a `SettingsRow` hint with the key file format:
  `LANGFUSE_PUBLIC_KEY=pk-lf-...` and `LANGFUSE_SECRET_KEY=sk-lf-...`, and `chmod 600 <path>`.

- [ ] **Step 1: Build** the settings screen and register it.
- [ ] **Step 2: Typecheck, audit, reload** as in Task 7 Steps 2-3.
- [ ] **Step 3: Manual check, Langfuse.** Ask the user to create the key file (do not handle the
  keys yourself) and enter their base URL. `Test connection` succeeds. Switch to Langfuse; the
  Prompts screen lists their `production` text prompts read-only. Attach one in New workspace
  and send. Then `chmod 644` the key file: the Prompts screen shows the chmod error; restore
  `chmod 600`.
- [ ] **Step 4: Commit.** `git commit -m "feat: add storage settings with langfuse connection test"`

---

### Task 9: Listing and docs

**Files:**
- Modify: `OVERVIEW.md`
- Create: `docs/setup.md`

- [ ] **Step 1: Write `OVERVIEW.md`** following the content rules in the paseo-plugin skill:
  what the plugin does, Local vs Langfuse, key file setup, per-host local prompts, text prompts
  only. No install commands, no em dashes.
- [ ] **Step 2: Write `docs/setup.md`**: key file creation, permissions, switching modes,
  `paseo plugin reload`, `paseo plugin logs saved-prompts`.
- [ ] **Step 3: Final verification.** `npm run typecheck && npm test`. Expected: exit 0, all
  tests pass.
- [ ] **Step 4: Commit.** `git commit -m "docs: add plugin overview and setup guide"`
