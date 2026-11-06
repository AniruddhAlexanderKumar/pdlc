// Sends synthetic mail to a disposable local SMTP sink, never a real provider.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
const modulePath = process.env.FOUNDER_TEST_SMTP_MODULE;
if (!modulePath?.startsWith('/') || process.env.NODE_ENV !== 'test') throw Error('Requires NODE_ENV=test and an absolute local SMTPServer module path');
const { SMTPServer } = await import(modulePath);
let captured = '', envelopeTo = '';
const smtp = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS', 'AUTH'], onData(stream: NodeJS.ReadableStream, session: { envelope: { rcptTo: { address: string }[] } }, done: (error?: Error | null) => void) {
  envelopeTo = session.envelope.rcptTo[0]?.address ?? '';
  stream.on('data', (chunk: Buffer) => { captured += chunk.toString(); });
  stream.on('end', () => done());
} });
await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve));
const port = smtp.server.address().port;
process.env.RESET_SMTP_HOST = '127.0.0.1'; process.env.RESET_SMTP_PORT = String(port);
process.env.RESET_SMTP_FROM = 'synthetic-sender@example.test'; process.env.APP_URL = 'http://localhost:5173';
process.env.RESET_SMTP_SECURE = 'false'; delete process.env.RESET_SMTP_USER; delete process.env.RESET_SMTP_PASSWORD;
const { deliverFounderRecoveryEmail } = await import('../src/auth/founder-recovery-mail.js');
const token = randomBytes(32).toString('base64url');
try {
  assert.equal(await deliverFounderRecoveryEmail('synthetic-recipient@example.test', token), 'sent');
  assert.equal(envelopeTo, 'synthetic-recipient@example.test');
  // Nodemailer may soft-wrap a quoted-printable line.
  assert(captured.replace(/=\r?\n/g, '').includes(`http://localhost:5173/founders/recovery#${token}`));
  assert(captured.includes('20 minutes') && captured.includes('authenticator'));
  assert.equal(await deliverFounderRecoveryEmail('synthetic-recipient@example.test', 'invalid'), 'unavailable');
} finally { await new Promise<void>((resolve) => smtp.close(resolve)); }
assert.equal(await deliverFounderRecoveryEmail('synthetic-recipient@example.test', token), 'failed');
console.log('PASS synthetic SMTP delivery to local sink and transport failure; no external provider or recovery UI verified');
