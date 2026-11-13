# Coding MCP setup

Global core: Context7 (pinned to 4.7.0), context-mode, and Serena.
Clojure MCP was removed from global configuration. CodeGraphContext and
jcodemunch remain installed but disabled globally.

## Optional project tools

To opt in, add the corresponding override to a trusted project's
`.codex/config.toml` and start a new Codex session:

```toml
[mcp_servers.codegraphcontext]
enabled = true

# Enable separately when useful:
# [mcp_servers.jcodemunch]
# enabled = true
```

CodeGraphContext uses explicit LadybugDB and per-repository contexts.
Run `cgc index . --no-progress` to create or refresh the index while the MCP
server is stopped. Local graph data is ignored by Git.

**Only one CGC process may open a project's embedded database at a time.**
A second process was tested and rejected with a file-lock error. Stop the
MCP server before using graph CLI queries or indexing. Use separate checkouts
with separate databases for concurrent sessions.

Read working-tree source before edits; graph and jcodemunch results can be
stale. Use Serena for ordinary navigation and ordinary search for small targets.

The old global database and WAL are preserved. A full pre-change backup is at
`~/.codex/backups/mcp-20261113-231545/`.

Validation: Context7 and context-mode tool calls, Serena initialization,
CGC handshake and repository-list call, Rust `main` lookup after restart,
and isolated indexing/querying in a temporary second project succeeded.
