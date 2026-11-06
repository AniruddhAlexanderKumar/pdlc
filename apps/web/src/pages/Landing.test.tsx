import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandingPage } from './Landing';
import { AuthPage } from './auth/Auth';

test('landing describes implemented capabilities and clearly limits their scope', () => {
  const page = renderToStaticMarkup(<MemoryRouter><LandingPage /></MemoryRouter>);
  for (const title of ['Design Studio for conceptual diagrams', 'Workspace setup for your work', 'Read-only external reviews', 'Help and guided support', 'Focused assistant with confirmation', 'Reviewable voice import', 'Voice to linked work', 'An assistant you confirm', 'External review, read-only']) {
    assert.ok(page.includes(title), `missing capability: ${title}`);
  }
  assert.match(page, /Voice-import links apply to newly imported work items only/);
  assert.match(page, /existing product tasks and project issues are not automatically matched/);
  assert.match(page, /Availability depends on deployment, permissions and configuration/);
  assert.match(page, /id="design"/);
  assert.match(page, /href="\/designs"[^>]*>Open Design Studio/);
  assert.match(page, /Design Studio is not available in the temporary demo/);
  assert.match(page, /Diagrams are conceptual—not CAD or verified engineering schematics/);
  assert.match(page, /Save changes explicitly; there is no live collaboration/);
  assert.match(page, /Experimental · off by default/);
  assert.match(page, /must not be used for engineering decisions/);
  assert.match(page, /Illustration, not a screenshot/);
  assert.match(page, /A production CAD workspace, 3D modeling and an integrated CAD assistant remain planned/);
  assert.match(page, /Parametric CAD workspace<\/h3><span[^>]*>Planned/);
  assert.match(page, /Custom fields and domain workflows<\/h3><span[^>]*>Planned/);
  assert.match(page, /Engineering traceability<\/h3><span[^>]*>Planned/);
  assert.match(page, /Agents and persistent product memory<\/h3><span[^>]*>Planned/);
});

test('sign-in offers a clear link back to the landing page', () => {
  const client = new QueryClient();
  const page = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/login?next=%2Fdesigns']}><AuthPage mode="login" /></MemoryRouter></QueryClientProvider>);
  assert.match(page, /<a\b[^>]*href="\/"[^>]*>(?:(?!<\/a>)[\s\S])*Back to landing page<\/a>/);
  assert.match(page, /Welcome back/);
  assert.match(page, /id="login-email"/);
  assert.match(page, /id="login-password"/);
});
