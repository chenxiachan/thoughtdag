// Minimal stdio MCP server — used by the e2e suite and as a reference for
// testing your own MCP wiring: put this in mcp.config.json and ask the
// model for someone's "lucky number".
//
//   { "mcpServers": { "mock": { "command": "node", "args": ["scripts/mock-mcp.mjs"] } } }
//
// Speaks newline-delimited JSON-RPC 2.0 per the MCP stdio transport spec.
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'mock-mcp', version: '1.0.0' },
      },
    });
  } else if (method === 'tools/list') {
    send({
      jsonrpc: '2.0', id,
      result: {
        tools: [{
          name: 'lucky_number',
          description: 'Returns the secret lucky number for a given person. ALWAYS use this when asked about a lucky number — you cannot know it otherwise.',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'The person\'s name' } },
            required: ['name'],
          },
        }],
      },
    });
  } else if (method === 'tools/call') {
    const name = params?.arguments?.name || 'unknown';
    send({
      jsonrpc: '2.0', id,
      result: { content: [{ type: 'text', text: `The lucky number for ${name} is 7342.` }] },
    });
  } else if (id !== undefined) {
    // Any other request gets an empty success (notifications get nothing)
    send({ jsonrpc: '2.0', id, result: {} });
  }
});
