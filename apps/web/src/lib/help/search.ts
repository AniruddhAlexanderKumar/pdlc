export interface SearchableHelpArticle {
  title: string;
  summary: string;
  body: string;
  category: string;
  keywords: string[];
}

const commonWords = new Set(['a', 'an', 'the', 'and', 'or', 'how', 'do', 'i', 'can', 'to', 'my', 'in', 'for', 'of', 'is']);
const normalize = (text: string) => text.toLocaleLowerCase().normalize('NFKC');

/** Search only articles already returned by the role-scoped Help API. */
export function searchHelpArticles<T extends SearchableHelpArticle>(articles: T[], search: string, category: string): T[] {
  const words = normalize(search).match(/[\p{L}\p{N}]+/gu)?.filter(word => !commonWords.has(word)) ?? [];
  return articles
    .map((article, index) => {
      const title = normalize(article.title);
      const summary = normalize(article.summary);
      const rest = normalize(`${article.body} ${article.category} ${article.keywords.join(' ')}`);
      const score = words.reduce((sum, word) => sum + (title.includes(word) ? 5 : summary.includes(word) ? 2 : rest.includes(word) ? 1 : 0), 0);
      return { article, index, score, matches: words.every(word => `${title} ${summary} ${rest}`.includes(word)) };
    })
    .filter(item => (category === 'all' || item.article.category === category) && item.matches)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.article);
}
