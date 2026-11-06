// Test-only OpenAI-compatible classifier stub. Never expose this to production.
import http from 'node:http';
const port = Number(process.env.GRAPH_AI_STUB_PORT ?? 8097);
http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const q = JSON.parse(body).messages.at(-1).content.toLowerCase();
      const intent = q.includes('malformed') ? 'malformed' : q.includes('impact') ? 'impact' : q.includes('disconnected') ? 'disconnected' : q.includes('connected') ? 'connections' : q.includes('blocking') ? 'blockers' : q.includes('unassigned') ? 'unassigned' : q.includes('duplicate') ? 'duplicates' : q.includes('high priority') ? 'high_priority' : q.includes('assigned') ? 'assigned' : 'unsupported';
      const content = intent === 'malformed' ? 'not json' : JSON.stringify({ intent, person: intent === 'assigned' ? 'Graph one' : null });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    } catch { res.writeHead(400).end(); }
  });
}).listen(port, '127.0.0.1', () => console.log(`Test classifier listening on ${port}`));
