import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchHelpArticles } from './search';

const articles = [
  { title: 'Create your first project', summary: 'Start tracking work', body: 'Open the project form.', category: 'Getting Started', keywords: ['new'] },
  { title: 'Invite members', summary: 'Invite a team', body: 'A project is not required.', category: 'Collaboration', keywords: ['collaborators'] },
  { title: 'Project issues', summary: 'Create an issue', body: 'Track work.', category: 'Projects', keywords: ['tasks'] }
];

describe('Help Centre search', () => {
  it('matches words across fields, ignoring case, word order and common question words', () => {
    assert.deepEqual(searchHelpArticles(articles, 'How do I CREATE a project?', 'all').map(a => a.title), ['Create your first project', 'Project issues']);
  });
  it('finds keywords and limits results to the selected category', () => {
    assert.deepEqual(searchHelpArticles(articles, 'collaborators', 'Collaboration').map(a => a.title), ['Invite members']);
    assert.deepEqual(searchHelpArticles(articles, 'project', 'Projects').map(a => a.title), ['Project issues']);
  });
  it('handles empty, whitespace and no-match searches without changing the input', () => {
    assert.deepEqual(searchHelpArticles(articles, '  ', 'all'), articles);
    assert.deepEqual(searchHelpArticles(articles, 'nonexistent', 'all'), []);
    assert.equal(articles.length, 3);
  });
});
