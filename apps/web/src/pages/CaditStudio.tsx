import { useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DesignDetail, DesignKind, ModelSource, DiagramSource, Project } from '@sv/shared';
import { get, post } from '../api/client';
import { journeyKeys, useProjectJourney } from '../api/projectJourney';
import { recordsKey, uploadJourneyFile, useJourneyRecords } from '../api/journeyRecords';
import { designUrl, StepFiles } from '../components/journey/StepWork';
import { stepLabel } from '../components/journey/stepLabels';
import { useProjectParam } from '../lib/useProjectParam';
import { useSession } from "../api/hooks";
import { Button, Input, Select, Spinner } from "../components/ui";
import { ProjectContextBar } from "../components/journey/ProjectContextBar";
import {
  CADIT_INIT,
  CADIT_ORIGIN,
  CADIT_URL,
  readCaditMessage,
} from "../cadit/protocol";

export function CaditStudioPage() {
  const me = useSession();
  return me.demo ? (
    <div className="p-6">
      Design Studio is not available in the temporary demo.
    </div>
  ) : (
    <CaditStudio key={`${me.user.id}:${me.workspace.id}`} />
  );
}

function CaditStudio() {
  const me = useSession();
  const [selected, select] = useProjectParam(me.workspace.id);
  const [params, setParams] = useSearchParams();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => get<Project[]>('/projects') });
  const projectId = projects.data?.find(project => project.id === selected)?.id ?? projects.data?.[0]?.id ?? null;
  const journey = useProjectJourney(projectId);
  const activities = journey.data?.stages.flatMap(stage => stage.activities) ?? [];
  const step = activities.find(activity => activity.id === params.get('step'))
    ?? activities.find(activity => stepLabel(activity).tool === 'design')
    ?? activities[0];
  const records = useJourneyRecords(projectId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const createdPath = useRef<string | null>(null);
  const create = useMutation({
    mutationFn: ({ name, projectId, activityId, kind }: { name: string; projectId: string; activityId?: string; kind: DesignKind }) =>
      post<DesignDetail<ModelSource | DiagramSource>>('/designs', { title: name, kind, projectId, productId: null, journeyActivityId: activityId }),
    onSuccess: async (result, variables) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: recordsKey(variables.projectId) }),
        qc.invalidateQueries({ queryKey: journeyKeys.project(variables.projectId) })
      ]);
      setTitle('');
      const target = designUrl(variables.kind, result.document.id, variables.projectId, variables.activityId);
      createdPath.current = target.split('?')[0];
      navigate(target);
    }
  });
  const saveExport = useMutation({
    mutationFn: ({ projectId, activityId, file }: { projectId: string; activityId: string; file: File }) =>
      uploadJourneyFile(projectId, activityId, file),
    onSuccess: (_result, variables) => qc.invalidateQueries({ queryKey: recordsKey(variables.projectId) })
  });
  useEffect(() => {
    if (projectId && projectId !== selected) select(projectId);
  }, [projectId, selected]);
  useEffect(() => { setTitle(''); }, [projectId]);
  const showCadit = params.get('editor') === 'cadit';
  const setCadit = (visible: boolean) => setParams(current => {
    const next = new URLSearchParams(current);
    if (visible) next.set('editor', 'cadit'); else next.delete('editor');
    return next;
  }, { replace: true });
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [exportStatus, setExportStatus] = useState("No STL received yet.");
  const [download, setDownload] = useState<{
    url: string;
    filename: string;
    file: File;
  } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ready = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (ready.current || ((create.isPending || saveExport.isPending) && nextLocation.pathname !== createdPath.current)) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        new URLSearchParams(currentLocation.search).get('project') !== new URLSearchParams(nextLocation.search).get('project') ||
        (ready.current && new URLSearchParams(nextLocation.search).get('editor') !== 'cadit')),
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (!ready.current) {
      blocker.reset();
      return;
    }
    if (
      window.confirm(
        "Leave CADit? Work not saved in CADit or exported may be lost.",
      )
    )
      blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (ready.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const session = (event: Event) => {
      if (
        ready.current &&
        !window.confirm(
          "Change session? Work not saved in CADit or exported may be lost.",
        )
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("sv:before-session-change", session);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("sv:before-session-change", session);
    };
  }, []);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  useEffect(() => {
    ready.current = false;
    if (!showCadit) return;
    setConnection("loading");
    const timeout = window.setTimeout(
      () => setConnection("unavailable"),
      20000,
    );
    const receive = (event: MessageEvent) => {
      const message = readCaditMessage(
        event,
        frame.current?.contentWindow ?? null,
      );
      if (!message) return;
      if (message.type === "ready") {
        window.clearTimeout(timeout);
        ready.current = true;
        frame.current?.contentWindow?.postMessage(CADIT_INIT, CADIT_ORIGIN);
        setConnection("ready");
      } else if (!ready.current) {
        return;
      } else if (message.type === "invalid-export") {
        setDownload(null);
        if (requestTimer.current) window.clearTimeout(requestTimer.current);
        setRequesting(false);
        setExportStatus(
          "CADit sent an invalid or empty STL export. Try exporting again.",
        );
      } else {
        if (requestTimer.current) window.clearTimeout(requestTimer.current);
        setRequesting(false);
        setDownload({
          url: URL.createObjectURL(message.blob),
          filename: message.filename,
          file: new File([message.blob], message.filename),
        });
        setExportStatus(
          `STL received: ${message.filename}. Select Download STL to save it to your device.`,
        );
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.clearTimeout(timeout);
      if (requestTimer.current) window.clearTimeout(requestTimer.current);
      window.removeEventListener("message", receive);
      ready.current = false;
    };
  }, [attempt, showCadit]);

  const previousProject = useRef(projectId);
  useEffect(() => {
    if (previousProject.current && projectId !== previousProject.current) {
      setDownload(null);
      setRequesting(false);
      setExportStatus("No STL received yet.");
      saveExport.reset();
      setAttempt(value => value + 1);
    }
    previousProject.current = projectId;
  }, [projectId]);

  const requestExport = () => {
    if (!ready.current || !frame.current?.contentWindow) return;
    frame.current.contentWindow.postMessage({ type: "get-stl" }, CADIT_ORIGIN);
    setDownload(null);
    setRequesting(true);
    setExportStatus("Waiting for CADit to export STL…");
    requestTimer.current = setTimeout(() => {
      setRequesting(false);
      setExportStatus("No STL was received. Check the editor and try again.");
    }, 30000);
  };
  const retry = () => {
    if (
      ready.current &&
      !window.confirm(
        "Reload CADit? Work not saved in CADit or exported may be lost.",
      )
    )
      return;
    setDownload(null);
    setRequesting(false);
    setExportStatus("No STL received yet.");
    setAttempt((value) => value + 1);
  };

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900 md:px-8">
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Design Studio
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Create a 3D model or diagram and save versions to your project.
        </p>
      </header>
      <div className="space-y-4 px-5 py-5 md:px-8">
        <ProjectContextBar />
        {projectId && <section aria-label="Project designs" className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-semibold">Project designs</h2>
          {step && <label className="block max-w-md text-sm">Link new work to
            <Select value={step.id} onChange={event => setParams(current => {
              const next = new URLSearchParams(current);
              next.set('project', projectId);
              next.set('step', event.target.value);
              return next;
            }, { replace: true })}>
              {activities.map(activity => <option key={activity.id} value={activity.id}>{stepLabel(activity).title}</option>)}
            </Select>
          </label>}
          {step && <Link className="block text-sm font-semibold text-blue-700 underline dark:text-blue-300" to={`/?project=${projectId}&step=${step.id}`}>Back to Journey step</Link>}
          {records.data?.designs.map(item => <p key={item.id} className="text-sm">
            <Link className="text-blue-700 underline dark:text-blue-300" to={designUrl(item.kind, item.id, projectId, step?.id)}>{item.label}</Link> · {item.kind === 'model' ? '3D model' : item.kind === 'sketch' ? 'Sketch' : 'Diagram'} · Version {item.revision}
          </p>)}
          <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
            event.preventDefault();
            if (!title.trim() || !step || create.isPending) return;
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            const kind = submitter instanceof HTMLButtonElement && submitter.value === 'diagram' ? 'diagram' : 'model';
            create.mutate({ name: title, projectId, activityId: step.id, kind });
          }}>
            <label className="block text-sm">Design name<Input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
            <Button type="submit" loading={create.isPending} disabled={!step || !title.trim()}>Create 3D model</Button>
            <Button type="submit" value="diagram" variant="secondary" disabled={create.isPending || !step || !title.trim()}>Create diagram</Button>
          </form>
          {(create.error || records.error || journey.error) && <p role="alert" className="text-sm">{(create.error || records.error || journey.error)?.message}</p>}
          {step && <details className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-700">
            <summary className="cursor-pointer font-semibold">Files and designs for this step</summary>
            <StepFiles key={step.id} projectId={projectId} activity={step} />
          </details>}
        </section>}
        {!showCadit && <Button variant="secondary" size="sm" onClick={() => setCadit(true)}>Open external CADit editor</Button>}
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to={projectId && step ? `/designs/sketches?project=${projectId}&step=${step.id}` : '/designs/sketches'} className="font-medium text-blue-700 hover:underline dark:text-blue-300">Experimental sketches</Link>
          <Link to="/designs/diagrams" className="font-medium text-blue-700 hover:underline dark:text-blue-300">Previous diagrams</Link>
        </div>
        {showCadit && <>
        <section
          aria-label="CADit editor"
          className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div role="status" aria-live="polite" className="text-sm">
              {connection === "loading" ? (
                <Spinner label="Waiting for CADit editor" />
              ) : connection === "ready" ? (
                "CADit ready signal received."
              ) : (
                "CADit did not respond. The service may be blocked, unavailable, or require this domain to be registered."
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={retry}>Reload editor</Button>
              <Button variant="secondary" size="sm" onClick={() => setCadit(false)}>Close CADit</Button>
            </div>
          </div>
          <div className="relative h-[70vh] min-h-[500px]">
            <iframe
              key={attempt}
              ref={frame}
              title="CADit 3D design editor"
              src={CADIT_URL}
              allow="clipboard-read; clipboard-write"
              referrerPolicy="no-referrer"
              aria-hidden={connection !== "ready"}
              tabIndex={connection === "ready" ? 0 : -1}
              className="block h-full w-full border-0"
              onError={() => setConnection("unavailable")}
            />
            {connection !== "ready" && (
              <div className="absolute inset-0 flex items-center justify-center bg-white p-6 text-center dark:bg-zinc-900">
                {connection === "loading" ? (
                  <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                    Waiting for CADit to confirm the editor is ready…
                  </p>
                ) : (
                  <div className="max-w-md space-y-3">
                    <h2 className="text-lg font-semibold">
                      CADit editor unavailable
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      The editor did not confirm it was ready. Your connection,
                      browser or hosting security settings, CADit availability,
                      or domain registration could be responsible. The cause
                      cannot be determined from this page.
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Use the built-in 3D editor or attach an existing design file under Project designs.
                    </p>
                    <a href="https://app.cadit.app/new" target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700 underline dark:text-blue-300">Open CADit in a new tab</a>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
        <section
          aria-label="STL export"
          className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="font-semibold">STL export</h2>
          <p
            role="status"
            aria-live="polite"
            className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
          >
            {exportStatus}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              onClick={requestExport}
              disabled={connection !== "ready" || requesting}
            >
              Request STL export
            </Button>
            {download && projectId && step && <Button
              size="sm" variant="secondary" loading={saveExport.isPending}
              onClick={() => saveExport.mutate({ projectId, activityId: step.id, file: download.file })}
            >Save a version to Journey</Button>}
            {download && (
              <a
                href={download.url}
                download={download.filename}
                className="inline-flex min-h-9 items-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Download STL
              </a>
            )}
          </div>
          {saveExport.isSuccess && <p role="status" className="mt-2 text-sm">Version saved to Journey.</p>}
          {saveExport.error && <p role="alert" className="mt-2 text-sm">{saveExport.error.message}</p>}
        </section>
        </>}
      </div>
    </div>
  );
}
