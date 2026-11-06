# Saved Prompts setup

## Install

```bash
npm install
npm run typecheck
paseo plugin install /absolute/path/to/paseo-saved-prompts
paseo plugin ls            # saved-prompts should be running
```

After editing the source, run `npm run typecheck` and `paseo plugin reload saved-prompts`. Do not
restart the daemon to pick up changes.

## Langfuse key file

Create the key file on the daemon machine. The default path is
`~/.config/paseo-saved-prompts/langfuse.env`; you can change it in the plugin settings.

```bash
mkdir -p ~/.config/paseo-saved-prompts
cat > ~/.config/paseo-saved-prompts/langfuse.env <<'KEYS'
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
KEYS
chmod 600 ~/.config/paseo-saved-prompts/langfuse.env
```

The file is read on every Langfuse request, so key changes apply without a reload. Blank lines,
`#` comments, and quoted values are allowed. On macOS and Linux a file readable by group or others
is refused.

## Switch storage

Open **Settings > Plugins > Saved Prompts > Storage**:

1. Choose **Local** or **Langfuse**.
2. For Langfuse, check the base URL and the label. The URL defaults to Langfuse Cloud EU
   (`https://cloud.langfuse.com`); use `https://us.cloud.langfuse.com` for the US region or your
   own URL when self-hosted.
3. Save, then use **Test connection**.

Local and Langfuse prompts are separate. Switching modes does not copy prompts between them.

## Troubleshooting

```bash
paseo plugin ls                  # status and load errors
paseo plugin logs saved-prompts  # server output, including Langfuse response errors
```

| Message | Fix |
| --- | --- |
| `Langfuse key file not found at ...` | Create the file or fix the path in settings. |
| `... is readable by other users. Run: chmod 600 ...` | Run the shown command. |
| `... has no LANGFUSE_SECRET_KEY line.` | Add the missing line. |
| `Langfuse rejected the keys (HTTP 401).` | Check the keys belong to the project at that URL. |
| `Cannot reach Langfuse at ...` | Check the base URL and that the daemon machine can reach it. |
| `Langfuse returned an unexpected response.` | Check the logs; the Langfuse version may differ from the one the plugin expects. |

## Development

```bash
npm test           # unit tests (Langfuse is a local stub server; no network)
npm run typecheck
```
