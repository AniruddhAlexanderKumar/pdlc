import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { LandingPage } from './Landing';

test('landing describes implemented capabilities and clearly limits their scope', () => {
  const page = renderToStaticMarkup(<MemoryRouter><LandingPage /></MemoryRouter>);
  for (const title of ['Workspace setup for your work', 'Read-only external reviews', 'Help and guided support', 'Focused assistant with confirmation', 'Reviewable voice import']) {
    assert.ok(page.includes(title), `missing capability: ${title}`);
  }
  assert.match(page, /Voice-import links apply to newly imported work items only/);
  assert.match(page, /existing product tasks and project issues are not automatically matched/);
  assert.match(page, /Availability depends on deployment, permissions and configuration/);
  assert.match(page, /Parametric CAD workspace<\/h3><span[^>]*>Planned/);
  assert.match(page, /Custom fields and domain workflows<\/h3><span[^>]*>Planned/);
  assert.match(page, /Engineering traceability<\/h3><span[^>]*>Planned/);
  assert.match(page, /Agents and persistent product memory<\/h3><span[^>]*>Planned/);
});
