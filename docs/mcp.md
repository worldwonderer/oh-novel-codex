# MCP server

ONX exposes lightweight stdio MCP servers without extra dependencies.

## Launch

```bash
onx mcp-server all
```

Or a narrower surface:

```bash
onx mcp-server state
onx mcp-server memory
onx mcp-server trace
```

## Supported requests

- `initialize`
- `notifications/initialized`
- `tools/list`
- `tools/call`

## Tool groups

### state
- `state_read`
- `state_clear`
- `state_list`

### memory
- `notepad_read`
- `notepad_write`
- `project_memory_read`
- `project_memory_write`

### trace
- `trace_timeline`
- `trace_summary`

## Example stdio usage

The server speaks JSON-RPC over stdio with `Content-Length` framing.

It is intended for MCP-compatible clients rather than manual terminal use.
