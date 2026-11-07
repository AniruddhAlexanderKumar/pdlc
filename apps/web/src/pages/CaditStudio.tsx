import { useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "react-router";
import { useSession } from "../api/hooks";
import { Button, Spinner } from "../components/ui";
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
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [connection, setConnection] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [exportStatus, setExportStatus] = useState("No STL received yet.");
  const [download, setDownload] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ready = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      ready.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
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
  }, [attempt]);

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
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Product development / Design
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Design Studio
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          3D design powered by CADit
        </p>
      </header>
      <main className="space-y-4 px-5 py-5 md:px-8">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          CADit is a third-party service. Designs are not saved to Solution
          Velocity or associated with a project. Save work in CADit if
          available, and export an STL before leaving.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            to="/designs/sketches"
            className="font-medium text-blue-700 hover:underline dark:text-blue-300"
          >
            Experimental sketches
          </Link>
          <Link
            to="/designs/diagrams"
            className="font-medium text-blue-700 hover:underline dark:text-blue-300"
          >
            Previous diagrams
          </Link>
        </div>
        <section
          aria-label="CADit editor"
          className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div role="status" aria-live="polite" className="text-sm">
              {connection === "loading" ? (
                <Spinner label="Waiting for CADit editor" />
              ) : connection === "ready" ? (
                "CADit editor ready."
              ) : (
                "CADit did not respond. The service may be blocked, unavailable, or require this domain to be registered."
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={retry}>
              Reload editor
            </Button>
          </div>
          <iframe
            key={attempt}
            ref={frame}
            title="CADit 3D design editor"
            src={CADIT_URL}
            allow="clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
            className="block h-[70vh] min-h-[500px] w-full border-0"
            onError={() => setConnection("unavailable")}
          />
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
        </section>
      </main>
    </div>
  );
}
