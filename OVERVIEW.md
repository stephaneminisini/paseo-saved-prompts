# Saved Prompts

Saved Prompts keeps the prompts you run again and again, such as a PR review, release prep, or a
triage checklist, and lets you attach one to the first message of a new workspace. Open
**New workspace**, choose the project, branch, and agent as usual, then pick **Attach > Saved
prompt**. The prompt text goes to the agent with anything you type, so it works the same for
Claude, Codex, and other providers.

## Where prompts are stored

Choose the storage in the plugin settings.

- **Local** (default): prompts live on the Paseo host. Create, edit, and delete them on the
  **Prompts** screen in the sidebar. Each host has its own list; a prompt saved on one host does
  not appear on another.
- **Langfuse**: prompts are read from a Langfuse instance, using the version that carries the
  label you choose (`production` by default). The Prompts screen is read-only; edit prompts in
  Langfuse. Only text prompts are listed; chat prompts are skipped. Use this mode to share the
  same prompts across several hosts.

## Langfuse setup

The base URL defaults to Langfuse Cloud (US, `https://us.cloud.langfuse.com`); change it for the
EU region (`https://cloud.langfuse.com`) or a self-hosted instance. Set the label in the plugin
settings. The plugin reads your Langfuse keys
from a file on the daemon machine, never from the app or the settings. By default the file is
`~/.config/paseo-saved-prompts/langfuse.env`:

```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

The file must be readable only by you (`chmod 600`); the plugin refuses it otherwise. Use **Test
connection** in the settings to check the URL and keys. The plugin calls only the Langfuse API at
the URL you set.

## Limits

- Prompts are sent as written. `{{placeholders}}` are not filled in; type extra context next to
  the attached prompt.
- Removing the plugin deletes its local prompts on that host.
