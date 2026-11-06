# Saved Prompts plugin for Paseo: design

Date: 2026-11-06
Status: approved 2026-11-06

## Intent

Stephane runs the same kinds of agent sessions over and over: a PR review of a repo's open PRs,
release prep, triage and investigations. Each prompt carries specific instructions. Today every
run means opening a new workspace in Paseo, pasting the prompt from somewhere, and starting the
chat.

The plugin stores these prompts once and lets the user drop one into the first message of a new
workspace in a few clicks. Paseo's own **New workspace** screen already picks the host, project,
checkout or worktree, branch, agent, and model, so the plugin does not rebuild any of that.

Success: launching a PR review on a new PR takes "open New workspace, pick project, attach
'PR review', send" with no copy and paste.

## Goals

1. Store a library of named prompts (PR review, release, triage, investigation, and so on).
2. Two storage modes, selected in plugin settings:
   - **Local** (default): prompts stored on the Paseo host, created and edited inside Paseo.
   - **Langfuse**: prompts read from a self-hosted Langfuse instance. Read-only in Paseo.
3. Attach a saved prompt to the composer on Paseo's New workspace screen (and any other
   composer) through a plugin attachment source. The prompt text is sent to the agent as part of
   the first message.
4. Work the same for Claude and Codex (and any other provider), because the prompt travels as
   message content, not as a provider-specific skill.

## Non-goals

- No automation. Nothing triggers on new PRs; there are no webhooks or schedules.
- No installing skills into Claude or Codex skill folders. These are prompts, not skills.
- No launch form of its own. Host, project, branch, worktree, agent, and model are chosen in
  Paseo's New workspace screen.
- No editing Langfuse prompts from Paseo. Edits happen in Langfuse.
- No sync, cache-as-fallback, or merging between Local and Langfuse. Exactly one mode is active.
- No `{{variable}}` substitution. Extra context is typed next to the attachment in the composer.
  (Builder's call made by Claude during design; the user can override.)

## Anti-goals

- Langfuse secret keys reaching the app, the settings JSON, logs, or the attachment text.
- A plugin UI that only works on desktop. Paseo plugins also run on iOS and Android.
- Silent failure: if Langfuse is unreachable or misconfigured, the user sees a clear error. The
  plugin does not quietly show an empty list or fall back to local prompts.

## User flows

### Launch with a saved prompt

1. User opens Paseo's **New workspace** screen and picks host, project, checkout or worktree,
   branch, agent, and model as usual.
2. In the composer, user opens the attach menu and chooses **Saved prompt**.
3. A search picker lists prompts from the active storage mode. Typing filters by name.
4. User picks "PR review". It appears as a pill in the composer. User may type extra text.
5. User sends. Paseo creates the workspace and starts the agent. The agent receives the prompt
   text as a text attachment plus any typed message.

### Manage prompts (Local mode)

The sidebar has a **Prompts** item that opens the Prompts screen:

- List of prompts by name, with a short description line if present.
- **New prompt**: name, optional description, prompt text (multiline). Save validates that the
  name is non-empty and unique on this host and the text is non-empty.
- Tap a prompt to edit it, or delete it with a confirmation.
- A header line shows the active mode ("Local prompts on <host>") and a link to the plugin
  settings.

### Browse prompts (Langfuse mode)

The same Prompts screen, read-only:

- List of prompts that carry the configured label, with name and version.
- Tap to preview the full prompt text.
- A Refresh action re-reads from Langfuse.
- Errors (unreachable host, bad keys, missing or unreadable key file) render as an error state with the reason.

### Configure

**Settings -> Plugins -> Saved Prompts** (registered with `addSettingsScreen`):

- **Storage**: Local or Langfuse.
- **Langfuse base URL**: the self-hosted instance, for example `https://langfuse.example.com`.
- **Label**: which Langfuse label selects the version to use. Default `production`.
- **Test connection**: calls Langfuse with the configured URL and keys and reports success or the
  error.
- **Key file path**: path on the daemon machine to the Langfuse key file. Default
  `~/.config/paseo-saved-prompts/langfuse.env`. A note shows the expected file format.

## Decisions

### Made by the user

- Prompts, not skills.
- Manual launch only; no automation.
- Several prompts, chosen per launch.
- Storage is Local or Langfuse, chosen in settings. No fallback between them (option 1).
- In Langfuse mode, Paseo only lists and launches; editing happens in Langfuse.
- Langfuse is self-hosted, and the `production` label marks the version to use.
- Host, project, and checkout-or-worktree are chosen per launch, not stored on the prompt.
- Launch goes through Paseo's New workspace screen using an attachment, for now. Prefilling the
  composer text is a separate future Paseo change (see Follow-up).
- Entry point: a Prompts screen opened from the sidebar (mockup option A).
- Langfuse keys come from a key file on the daemon machine, not environment variables. Env vars
  would need a daemon restart because the plugin subprocess inherits the daemon's environment from
  daemon startup (`packages/server/src/server/plugins/runtime.ts`, `fork()` without `env`).
- Local prompts are per host. Prompts saved on one host only appear in composers for that host.
  Langfuse mode is the answer for using the same prompts on several hosts; each host is configured
  separately.
- Only Langfuse `text` prompts are supported; `chat` prompts are skipped. The user's prompts are
  text prompts.

### Made by Claude during design (check these)

- **Key file format and handling.** Dotenv-style lines `LANGFUSE_PUBLIC_KEY=...` and
  `LANGFUSE_SECRET_KEY=...` (names follow the Langfuse SDK convention). The server reads the file
  on each Langfuse request, so key changes apply without a reload. Leading `~` expands to the
  daemon user's home. On macOS and Linux the plugin refuses a file readable by group or others
  (like ssh does with private keys) and says to `chmod 600` it. The file path lives in settings;
  the keys never do, because Paseo plugin settings are plain host-side JSON and not a credential
  vault. Key values are never logged or returned to the client.
- **Local prompts are stored in a host-scoped plugin settings document** (`defineSettings`,
  `scope: "host"`), not in a separate file. This gives atomic writes, validation, revision
  conflict detection, and live updates to every connected client for free. Prompts stored this
  way survive daemon restarts and plugin updates, and are deleted if the plugin is removed.
- **No variable substitution.** `{{placeholders}}` in a Langfuse prompt are sent as written.
- **The prompt text is included in every search result**, because Paseo has no later step that
  fetches it. In Langfuse mode that means fetching each listed prompt's text.
- **Settings screen for configuration, sidebar screen for prompts.** Configuration uses Paseo's
  standard plugin settings page; the sidebar screen is for the prompt library.

## Architecture

A standard Paseo plugin created with `paseo plugin init`, with both runtimes.

```text
paseo-saved-prompts/
  paseo-plugin.json          id "saved-prompts", requirements.paseo ">=0.15.0"
  OVERVIEW.md
  index.client.tsx           sidebar item, Prompts screen, settings screen, attachment source
  index.server.ts            RPC handlers, settings registration
  client/                    React Native screens and components
  server/
    local-store.ts           CRUD over the settings document
    langfuse.ts              Langfuse HTTP client (list, get, test)
    prompts.ts               mode dispatch: returns prompts from the active store
  shared/
    contracts.ts             Zod RPC contracts and the attachment source definition
    settings.ts              settings documents (config, local prompts)
  tests/
  docs/
```

### Settings documents (shared)

- `config`: `{ mode: "local" | "langfuse", langfuseBaseUrl: string, langfuseLabel: string }`,
  defaults `mode: "local"`, `langfuseLabel: "production"`, empty URL.
- `local-prompts`: `{ prompts: Array<{ id, name, description?, text, updatedAt }> }`, default
  empty.

### RPCs (shared contracts, server handlers)

- `prompts.search({ query })`: the attachment source's search RPC. Returns
  `PluginAttachmentItem`s from the active mode, filtered by case-insensitive name match.
- `prompts.list()` and `prompts.get({ id })`: back the Prompts screen in both modes.
- `prompts.langfuse.test()`: Test connection.

Local prompts are written by the Prompts screen with `useSettings(localPrompts).save(values,
revision)`. Paseo's server-side settings handle only has `read()` and `subscribe()`
(`packages/plugin/src/server/contracts.ts`), so there are no server write RPCs. The settings
schema enforces non-empty, unique names and non-empty text, so the host rejects bad writes. The
Prompts screen hides editing in Langfuse mode; that rule is enforced in the UI only. (Claude's
call after the builder check.)

All Langfuse HTTP calls happen in the server runtime. The client never sees the keys.

### Attachment items

Paseo's attachment item schema requires `id`, `identifier`, `title`, `url` (a valid URL), `text`,
and `resourceType` (`packages/plugin/src/attachments.ts`). Mapping:

| Field          | Local                          | Langfuse                                        |
| -------------- | ------------------------------ | ----------------------------------------------- |
| `id`           | prompt id                      | `<name>@<version>`                              |
| `identifier`   | prompt name                    | prompt name                                     |
| `title`        | prompt name                    | prompt name                                     |
| `subtitle`     | description                    | `v<version> · <label>`                          |
| `url`          | a stable URL for the prompt    | the prompt's page in the Langfuse UI            |
| `text`         | prompt text                    | resolved prompt text for the configured label   |
| `resourceType` | `"prompt"`                     | `"prompt"`                                      |

The agent receives the item as a text attachment titled `<identifier> <title>`
(`packages/app/src/plugins/attachments/model.ts`).

### Langfuse integration

Uses the Langfuse public REST API with HTTP basic auth (public key as user, secret key as
password) against the configured base URL:

- List prompts filtered by the configured label.
- Fetch a single prompt by name and label to get its text and version.

Builder confirms the exact endpoints and response shapes against the Langfuse API reference for
the user's self-hosted version.

## Constraints

- Paseo plugin rules: React Native primitives only in client code, colors from `theme.colors`,
  `layout.compact` for mobile, no DOM, import boundaries between `client/`, `server/`, `shared/`.
  See `public-docs/plugins/reference.md` in the Paseo checkout.
- `requirements.paseo` set to the lowest version that has every API used. Local daemon is 0.15.0.
- Plugins are enabled on the local daemon (`pluginsEnabled: true` in `~/.paseo/config.json`).
- User's engineering rules (`~/.claude/CLAUDE.md`): typed boundaries, Zod validation of external
  input (Langfuse responses included), specific error handling with logged context, no secrets in
  logs, tests for happy path, edge cases, and each error type, with network mocked.
- Do not restart the Paseo daemon; use `paseo plugin reload saved-prompts`.

## Error handling

| Case                                           | Behavior                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Langfuse mode, base URL empty                  | Error: "Set the Langfuse base URL in plugin settings."                   |
| Langfuse mode, key file missing or unreadable  | Error naming the path and the reason.                                    |
| Key file readable by group or others           | Error asking to `chmod 600` the file.                                    |
| Key file lacks a required key                  | Error naming the missing key.                                            |
| Langfuse unreachable or non-2xx                | Error with status or network reason. No fallback to Local.               |
| Langfuse 401/403                               | Error stating the keys were rejected.                                    |
| Langfuse response fails schema                 | Error stating Langfuse returned an unexpected response; detail is logged. |
| Langfuse chat prompt                           | Omitted from lists.                                                      |
| Local save with empty or duplicate name        | Validation error on the form.                                            |
| Local save with stale revision                 | Paseo's revision conflict; form keeps the draft and asks to reload.      |

## Testing

- Unit tests for the local store (create, update, delete, duplicate names, empty fields).
- Unit tests for the Langfuse client with `fetch` mocked: success, label filtering, chat prompts
  skipped, 401, 404, network error, malformed response.
- Unit tests for the key file reader (filesystem mocked): valid file, missing file, missing key,
  comments and blank lines, `~` expansion, too-open permissions.
- Unit tests for search filtering and attachment item mapping in both modes.
- Manual check in the running app: install, attach a prompt on the New workspace screen with
  Claude and with Codex, confirm the agent receives the text; switch to Langfuse mode and repeat;
  check a compact (mobile-width) window and a dark theme.

## Left to the builder

- Exact Langfuse endpoints, pagination, and whether to cache the prompt list briefly.
- How many search results to return and whether to fetch prompt text lazily or up front.
- The stable `url` for Local prompts (for example a custom scheme) as long as it passes the
  attachment schema.
- Screen layout details within the mobile and theme rules.
- `OVERVIEW.md` content.

## Follow-up (separate project)

A change to Paseo itself so the New workspace screen can open with composer text prefilled, and
a plugin API to open it that way. The user plans to raise this as a PR against `getpaseo/paseo`.
Once it ships, the plugin can add an "Open in New workspace" action that prefills the prompt text
instead of attaching it. It gets its own design.
