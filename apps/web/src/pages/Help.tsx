import { Link } from 'react-router';
import { ArrowRight, BookOpen, CircleHelp, FolderKanban, Package, Settings, Trophy, Users } from 'lucide-react';
import { Card } from '../components/ui';

const guides = [
  {
    icon: Package,
    title: 'Create and develop a product',
    detail: 'Select New product from the sidebar or mobile header. Add the information you have, then open the product to update its details and work through the stages that fit your process. You can return to a product later; every stage does not need to be complete before you start.'
  },
  {
    icon: FolderKanban,
    title: 'Organize projects and issues',
    detail: 'Open Projects to create or find delivery work. Within a project, use its issues to describe tasks, set status and priority, and assign a workspace member. Keep project work tied to its product so decisions have context.'
  },
  {
    icon: BookOpen,
    title: 'Track materials and costs',
    detail: 'Add materials and supplier records from their respective sections. Enter supplier quotes and product cost assumptions such as labour, packaging, and overhead on the product cost view. Review the assumptions when a quote or plan changes.'
  },
  {
    icon: Trophy,
    title: 'Understand XP and contributions',
    detail: 'Achievements shows your progress. In workspaces with one or two members, XP helps track personal activity consistency. Workspaces with more than two members use reviewed contribution outcomes; scores are based on evidence and an authorized review, not simply on activity volume.'
  },
  {
    icon: Users,
    title: 'Manage your workspace',
    detail: 'Open Settings & team from the workspace menu to manage workspace membership and account preferences. The workspace menu also lets you switch workspaces and change the theme.'
  }
];

const questions = [
  ['Where should I begin?', 'Use New product to create your first record, or try the preset-data demo first. The dashboard also offers sample products when your workspace is empty.'],
  ['Can I change my dashboard?', 'Dashboard layouts and presets are available from the dashboard controls. On phones and tablets, the standard layout is used.'],
  ['Does the demo use my workspace data?', 'No. The public demo is a separate, time-limited, read-only view with fictional records.'],
  ['Why can’t I see a reviewed contribution score?', 'Reviewed contribution scoring is used only when the workspace has more than two members. Smaller workspaces use the personal consistency tracker instead.'],
  ['Are GitHub and Jira connected?', 'No. External GitHub and Jira integrations are not available in this build.']
];

export function HelpPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-8 md:px-6">
      <header className="max-w-3xl">
        <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Help center</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">A practical guide to your workspace</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Follow the parts of the product lifecycle that fit your team. Start small, add information as you learn,
          and use the links below to jump directly to a workspace area.
        </p>
        <Link to="/demo" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">
          Explore the read-only demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      <section aria-labelledby="help-guides-title">
        <h2 id="help-guides-title" className="mb-4 text-lg font-semibold">Common tasks</h2>
        <div className="grid gap-3">
          {guides.map(({ icon: Icon, title, detail }) => (
            <Card key={title} className="flex gap-4 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{detail}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="help-shortcuts-title">
        <h2 id="help-shortcuts-title" className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Settings className="h-4 w-4 text-zinc-500" aria-hidden="true" /> Quick links
        </h2>
        <div className="flex flex-wrap gap-2">
          {[
            ['Dashboard', '/'],
            ['Products', '/products'],
            ['Projects', '/projects'],
            ['Materials', '/materials'],
            ['Suppliers', '/suppliers'],
            ['Achievements', '/achievements'],
            ['Settings & team', '/settings']
          ].map(([label, to]) => (
            <Link key={to} to={to} className="rounded-full border border-zinc-200 px-3.5 py-2 text-sm font-medium hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300">
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="help-faq-title">
        <h2 id="help-faq-title" className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <CircleHelp className="h-4 w-4 text-zinc-500" aria-hidden="true" /> Frequently asked questions
        </h2>
        <div className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {questions.map(([question, answer]) => (
            <details key={question} className="group py-4">
              <summary className="cursor-pointer list-none pr-6 text-sm font-medium">
                {question}
                <span className="float-right text-zinc-400 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
