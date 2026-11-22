import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { FolderKanban, Sparkles } from 'lucide-react';
import { JOURNEY_TEMPLATES, journeyTemplate, type JourneyTemplateId, type Project } from '@sv/shared';
import { get, post } from '../../api/client';
import { setSelectedProjectId } from '../../lib/projectContext';
import { useSession } from '../../api/hooks';
import { Button, Field, Input, Modal, Select, Textarea } from '../ui';
import { useToast } from '../Toast';

const TYPE_LABELS: Record<JourneyTemplateId, { type: string; blurb: string }> = {
  hardware: { type: 'Hardware product', blurb: 'Physical product: requirements, design, prototype, validation.' },
  software: { type: 'Software product', blurb: 'Discovery, design, build, test and release.' },
  research: { type: 'Research study', blurb: 'Proposal, background, experiments, analysis, report.' },
  general: { type: 'General project', blurb: 'Flexible initiate, plan, execute, review lifecycle.' }
};

/**
 * Create a project from Journey. The chosen project type recommends the
 * lifecycle template; the preview shows the stages that will be created, and
 * every stage stays editable afterwards.
 */
export function NewProjectModal({ onClose }: { onClose: () => void }) {
  const me = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState<JourneyTemplateId>('hardware');
  const existing = useQuery({ queryKey: ['projects'], queryFn: () => get<Project[]>('/projects') });

  const create = useMutation({
    mutationFn: () => post<Project>('/projects', { key, name: name.trim(), description: description.trim(), template }),
    onSuccess: async (project) => {
      await qc.invalidateQueries({ queryKey: ['projects'] });
      setSelectedProjectId(me.workspace.id, project.id);
      toast.success(`Project ${project.key} created — its Journey is ready`);
      onClose();
      navigate(`/?project=${project.id}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create project')
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && key) create.mutate();
  };

  const preview = journeyTemplate(template);

  return (
    <Modal
      title="New project"
      subtitle="Every project gets its own Journey. Pick the type that fits — we'll set up a suggested lifecycle."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!name.trim() || !key} icon={<Sparkles className="h-4 w-4" />}>
            Create project & Journey
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" htmlFor="new-project-name">
            <Input
              id="new-project-name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => {
                const value = event.target.value;
                setName(value);
                if (!keyEdited) {
                  let candidate = value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .replace(/^[^A-Z]+/, '')
                    .slice(0, 8);
                  if (candidate.length === 1) candidate += 'X';
                  if (!candidate) candidate = 'PR';
                  const used = new Set(existing.data?.map((p) => p.key) ?? []);
                  let base = candidate;
                  let n = 2;
                  while (used.has(candidate) && n < 100) candidate = `${base.slice(0, 8)}${n++}`;
                  setKey(candidate);
                }
              }}
              placeholder="e.g. Solar water purifier"
            />
          </Field>
          <Field label="Project key" htmlFor="new-project-key" hint="Used for task keys, e.g. PURIF-1.">
            <Input
              id="new-project-key"
              required
              minLength={2}
              maxLength={10}
              pattern="[A-Za-z][A-Za-z0-9]{1,9}"
              value={key}
              onChange={(event) => {
                setKeyEdited(true);
                setKey(event.target.value.toUpperCase());
              }}
              placeholder="PURIF"
              autoCapitalize="characters"
            />
          </Field>
        </div>
        <Field label="Description" htmlFor="new-project-description">
          <Textarea
            id="new-project-description"
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this project working toward?"
          />
        </Field>
        <Field label="Project type" htmlFor="new-project-type" hint="We recommend a lifecycle template for this type. You can customise the Journey afterwards.">
          <Select id="new-project-type" value={template} onChange={(event) => setTemplate(event.target.value as JourneyTemplateId)}>
            {JOURNEY_TEMPLATES.map((id) => (
              <option key={id} value={id}>
                {TYPE_LABELS[id].type}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{TYPE_LABELS[template].blurb}</p>
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/40">
          <p className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
            <FolderKanban className="h-4 w-4" aria-hidden="true" />
            Recommended Journey · {preview.label}
          </p>
          <p className="mt-1 text-xs text-blue-800 dark:text-blue-300">{preview.description}</p>
          <ol className="mt-3 flex flex-wrap gap-1.5">
            {preview.stages.map((stage, index) => (
              <li
                key={stage.name}
                className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
              >
                {index + 1}. {stage.name}
              </li>
            ))}
          </ol>
        </div>
      </form>
    </Modal>
  );
}
