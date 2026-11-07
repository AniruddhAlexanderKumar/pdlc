"use client";

import * as React from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { drag } from "d3-drag";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import { AlertTriangle, Maximize2, RotateCcw } from "lucide-react";
import {
  GRAPH_DIRECTIONS,
  GRAPH_LIMITS,
  graphNodeKey,
  graphNodeTypeLabel,
  type GraphDirection,
  type GraphNodeRef,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type GraphEdgeDto,
  type GraphNodeDto,
  type TraversalResultDto,
  runGraphTraversal,
} from "@/lib/api/traceability";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { useResource } from "@/lib/api/use-resource";
import { cn } from "@/lib/utils";

/**
 * The Digital Thread Graph — a real, interactive visualization of
 * `EngineeringGraphService.traverse`'s own output, nothing more.
 *
 * There is no second graph model here. Every node and edge on screen is
 * exactly what `POST /graph/traverse` returned for this root — the same
 * bounded, capped, breadth-first walk `TraceabilityPathExplorer`'s list
 * view already reads, just laid out spatially instead of listed as text.
 * If the traversal was truncated by a real limit, this view says so, the
 * same as the list view does — a force layout has no way to imply
 * completeness a bounded traversal doesn't have.
 *
 * The physics (d3-force) only decides *where* things sit on screen; it
 * never decides what exists. React renders the static SVG structure once;
 * the simulation writes positions directly to DOM attributes on each tick
 * via refs, which is what keeps this smooth at the tick rate a force
 * simulation actually runs at — re-rendering React state 60 times a
 * second would not.
 */

/** Broad visual categories, mapped straight onto the app's own semantic color tokens — no new palette. */
type NodeCategory =
  | "core"
  | "design"
  | "decision"
  | "verification"
  | "attention"
  | "supplier"
  | "configuration"
  | "certification";

const CATEGORY_BY_TYPE: Partial<Record<GraphNodeDto["type"], NodeCategory>> = {
  PROJECT: "core",
  STAKEHOLDER_NEED: "core",
  REQUIREMENT: "core",
  DESIGN_ITEM: "design",
  INTERFACE_DEFINITION: "design",
  ENGINEERING_DECISION: "decision",
  DECISION_ALTERNATIVE: "decision",
  DECISION_ASSUMPTION: "decision",
  DECISION_EXPECTATION: "decision",
  VERIFICATION_ACTIVITY: "verification",
  EVIDENCE: "verification",
  APPROVAL: "verification",
  RISK: "attention",
  ISSUE: "attention",
  CHANGE_REQUEST: "attention",
  SUPPLIER: "supplier",
  SUPPLIED_ITEM: "supplier",
  SUPPLIER_QUALIFICATION: "supplier",
  ENGINEERING_BASELINE: "configuration",
  BASELINE_MEMBER: "configuration",
  OPERATIONAL_OBSERVATION: "configuration",
  DRIFT_ASSESSMENT: "configuration",
  DRIFT_FINDING: "configuration",
  CERTIFICATION_PROGRAM: "certification",
  CERTIFICATION_BASIS: "certification",
  COMPLIANCE_ITEM: "certification",
  CERTIFICATION_FINDING: "certification",
  CERTIFICATION_REVIEW: "certification",
  CERTIFICATION_REVIEW_FINDING: "certification",
};

/** Same design tokens `globals.css` defines — every other color on screen comes from these. */
const CATEGORY_COLOR: Record<NodeCategory, string> = {
  core: "var(--info)",
  design: "var(--primary)",
  decision: "var(--warning)",
  verification: "var(--success)",
  attention: "var(--destructive)",
  supplier: "#7c6fd6",
  configuration: "#5b6472",
  certification: "#0d9488",
};

const CATEGORY_LABEL: Record<NodeCategory, string> = {
  core: "Requirements",
  design: "Design",
  decision: "Decisions",
  verification: "Verification & evidence",
  attention: "Risk, issue & change",
  supplier: "Supplier",
  configuration: "Baseline & drift",
  certification: "Certification",
};

function categoryOf(type: GraphNodeDto["type"]): NodeCategory {
  return CATEGORY_BY_TYPE[type] ?? "core";
}

interface SimNode {
  id: string;
  node: GraphNodeDto;
  isRoot: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  edge: GraphEdgeDto;
}

const DIRECTION_LABELS: Record<GraphDirection, string> = {
  BOTH: "Both",
  OUTBOUND: "Outbound",
  INBOUND: "Inbound",
};

const NODE_RADIUS = 9;
const ROOT_RADIUS = 13;

export function TraceabilityGraphView({
  projectId,
  root,
  onNavigate,
}: {
  projectId: string;
  root: GraphNodeRef;
  onNavigate: (node: GraphNodeDto) => void;
}) {
  const [direction, setDirection] = React.useState<GraphDirection>("BOTH");
  const [maxDepth, setMaxDepth] = React.useState(2);

  const load = React.useCallback(
    (signal: AbortSignal) => runGraphTraversal(projectId, { root, direction, maxDepth }, signal),
    // root is represented by its own key below; a new object with the same
    // type/id must not trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, root.type, root.id, direction, maxDepth],
  );
  const { state, reload } = useResource<TraversalResultDto>(
    load,
    `graph-traversal:${projectId}:${graphNodeKey(root)}:${direction}:${maxDepth}`,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="graph-direction">Direction</Label>
          <Select
            id="graph-direction"
            className="w-40"
            value={direction}
            onChange={(event) => setDirection(event.target.value as GraphDirection)}
          >
            {GRAPH_DIRECTIONS.map((value) => (
              <option key={value} value={value}>
                {DIRECTION_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="graph-depth">Depth</Label>
          <Select
            id="graph-depth"
            className="w-32"
            value={String(maxDepth)}
            onChange={(event) => setMaxDepth(Number(event.target.value))}
          >
            {Array.from({ length: GRAPH_LIMITS.maxMaxDepth }, (_, index) => index + 1).map(
              (depth) => (
                <option key={depth} value={depth}>
                  {depth} {depth === 1 ? "hop" : "hops"}
                </option>
              ),
            )}
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reload}>
          <RotateCcw aria-hidden="true" />
          Re-layout
        </Button>
      </div>

      {state.phase === "loading" && <LoadingState label="Loading the digital thread…" />}

      {state.phase === "error" && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{describeApiError(state.error)}</span>
        </p>
      )}

      {state.phase === "ready" && (
        <GraphCanvas
          key={`${graphNodeKey(root)}:${direction}:${maxDepth}`}
          result={state.data}
          onNavigate={onNavigate}
          onNarrow={maxDepth > 1 ? () => setMaxDepth((depth) => depth - 1) : null}
        />
      )}
    </div>
  );
}

function GraphCanvas({
  result,
  onNavigate,
  onNarrow,
}: {
  result: TraversalResultDto;
  onNavigate: (node: GraphNodeDto) => void;
  /** Reduce the depth by one hop and re-run, or null when already at the minimum. */
  onNarrow: (() => void) | null;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const zoomGroupRef = React.useRef<SVGGElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 720, height: 480 });
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [focusedNode, setFocusedNode] = React.useState<GraphNodeDto | null>(null);

  const rootKey = graphNodeKey(result.root);

  const {
    nodes: simNodes,
    links: simLinks,
    neighborsOf,
  } = React.useMemo(() => {
    const nodesById = new Map<string, SimNode>();
    for (const entry of result.nodes) {
      const key = graphNodeKey(entry.node);
      nodesById.set(key, { id: key, node: entry.node, isRoot: key === rootKey });
    }
    const links: SimLink[] = [];
    const neighbors = new Map<string, Set<string>>();
    for (const edge of result.edges) {
      const sourceKey = graphNodeKey(edge.source);
      const targetKey = graphNodeKey(edge.target);
      // Both endpoints of every returned edge are always among the
      // returned nodes — the traversal never emits a dangling reference —
      // but this stays defensive rather than assuming it.
      if (!nodesById.has(sourceKey) || !nodesById.has(targetKey)) continue;
      links.push({ source: sourceKey, target: targetKey, edge });
      if (!neighbors.has(sourceKey)) neighbors.set(sourceKey, new Set());
      if (!neighbors.has(targetKey)) neighbors.set(targetKey, new Set());
      neighbors.get(sourceKey)!.add(targetKey);
      neighbors.get(targetKey)!.add(sourceKey);
    }
    return { nodes: [...nodesById.values()], links, neighborsOf: neighbors };
  }, [result, rootKey]);

  // Track the container's real size so the simulation centers correctly and
  // the SVG never forces horizontal overflow on a narrow viewport.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width } = entry.contentRect;
      setDimensions({ width: Math.max(320, width), height: 480 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The simulation itself: runs once per distinct node/edge set (the parent
  // remounts this component via `key` whenever the root/direction/depth
  // changes), writing positions straight to the DOM on every tick.
  React.useEffect(() => {
    const svg = svgRef.current;
    const zoomGroup = zoomGroupRef.current;
    if (!svg || !zoomGroup || simNodes.length === 0) return;

    const selection = select(svg);
    const zoomG = select(zoomGroup);

    // React already created and will destroy these DOM elements, in the
    // exact same order as `simLinks`/`simNodes` (both rendered via a plain
    // `.map()` over those same arrays) — d3 never enters or exits anything
    // here. `.data(array)` with no key function is a *positional* join:
    // selected DOM node i is bound to `array[i]`, which is exactly the
    // correlation that already holds. (The keyed overload is the wrong tool
    // here — it needs *existing* bound data to reconcile against, and on a
    // fresh selection every node's `__data__` is undefined, which throws.)
    // Binding is what lets the tick handler below read `d.x`/`d.y` off the
    // SimNode/SimLink d3-force mutates in place.
    const edgeSelection = zoomG.selectAll<SVGLineElement, SimLink>(".graph-edge").data(simLinks);
    const nodeSelection = zoomG.selectAll<SVGGElement, SimNode>(".graph-node").data(simNodes);

    const simulation = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(70)
          .strength(0.5),
      )
      .force("charge", forceManyBody().strength(-220))
      .force(
        "collide",
        forceCollide<SimNode>((d) => (d.isRoot ? ROOT_RADIUS : NODE_RADIUS) + 14),
      )
      .force("center", forceCenter(dimensions.width / 2, dimensions.height / 2));

    function tick() {
      edgeSelection
        .attr("x1", (d) => (typeof d.source === "object" ? (d.source.x ?? 0) : 0))
        .attr("y1", (d) => (typeof d.source === "object" ? (d.source.y ?? 0) : 0))
        .attr("x2", (d) => (typeof d.target === "object" ? (d.target.x ?? 0) : 0))
        .attr("y2", (d) => (typeof d.target === "object" ? (d.target.y ?? 0) : 0));

      nodeSelection.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    }

    simulation.on("tick", tick);

    // Nodes are draggable — pinning a node's position (fx/fy) while dragged,
    // released back to the simulation on drop, the standard d3-force pattern.
    const dragBehavior = drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.15).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeSelection.call(dragBehavior);

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2.5])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        zoomG.attr("transform", event.transform.toString());
      });
    selection.call(zoomBehavior);
    selection.call(zoomBehavior.transform, zoomIdentity);

    return () => {
      simulation.stop();
      selection.on(".zoom", null);
    };
  }, [simNodes, simLinks, dimensions.width, dimensions.height]);

  function resetZoom() {
    const svg = svgRef.current;
    if (!svg) return;
    select(svg).call(zoom<SVGSVGElement, unknown>().transform, zoomIdentity);
  }

  const categoriesPresent = React.useMemo(
    () => [...new Set(simNodes.map((n) => categoryOf(n.node.type)))].sort(),
    [simNodes],
  );

  return (
    <div className="flex flex-col gap-3">
      {result.limits.truncated && result.limits.truncatedBy && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          <span>
            Refused rather than guessed: this traversal hit a real limit (
            {result.limits.truncatedBy.replace(/_/g, " ").toLowerCase()}) and stopped. Not every
            relationship within this depth is drawn — this is a smaller, honest answer, not a
            silently incomplete one.
          </span>
          {onNarrow && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onNarrow}
            >
              Narrow by one hop
            </Button>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
          {categoriesPresent.map((category) => (
            <li key={category} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLOR[category] }}
                aria-hidden="true"
              />
              {CATEGORY_LABEL[category]}
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" onClick={resetZoom}>
          <Maximize2 aria-hidden="true" />
          Reset view
        </Button>
      </div>

      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-lg border border-border bg-secondary/20"
      >
        <svg
          ref={svgRef}
          role="img"
          aria-label={`Digital thread graph rooted at ${result.root.identifier ?? result.root.label}, ${simNodes.length} objects and ${simLinks.length} relationships`}
          width="100%"
          height={dimensions.height}
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          className="touch-none"
        >
          <g ref={zoomGroupRef}>
            {simLinks.map((link) => (
              <line
                key={`${link.edge.type}:${link.edge.relationshipId}`}
                className="graph-edge"
                stroke="var(--border)"
                strokeWidth={
                  hoveredId &&
                  (graphNodeKey(link.edge.source) === hoveredId ||
                    graphNodeKey(link.edge.target) === hoveredId)
                    ? 2
                    : 1
                }
                opacity={
                  hoveredId &&
                  graphNodeKey(link.edge.source) !== hoveredId &&
                  graphNodeKey(link.edge.target) !== hoveredId
                    ? 0.25
                    : 0.8
                }
              />
            ))}
            {simNodes.map((simNode) => {
              const category = categoryOf(simNode.node.type);
              const dimmed =
                hoveredId !== null &&
                hoveredId !== simNode.id &&
                !neighborsOf.get(hoveredId)?.has(simNode.id);
              const label = simNode.node.identifier ?? simNode.node.label;
              return (
                <g
                  key={simNode.id}
                  className="graph-node cursor-grab active:cursor-grabbing"
                  role="button"
                  tabIndex={0}
                  aria-label={`${graphNodeTypeLabel(simNode.node.type)} ${label}${simNode.isRoot ? " (currently inspecting)" : ""}`}
                  opacity={dimmed ? 0.35 : 1}
                  onMouseEnter={() => setHoveredId(simNode.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setFocusedNode(simNode.node)}
                  onBlur={() => setFocusedNode(null)}
                  onClick={() => onNavigate(simNode.node)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onNavigate(simNode.node);
                    }
                  }}
                >
                  <circle
                    r={simNode.isRoot ? ROOT_RADIUS : NODE_RADIUS}
                    fill={CATEGORY_COLOR[category]}
                    stroke={simNode.isRoot ? "var(--foreground)" : "var(--card)"}
                    strokeWidth={simNode.isRoot ? 2.5 : 1.5}
                    className="focus-visible:outline-none"
                  />
                  <text
                    y={simNode.isRoot ? ROOT_RADIUS + 12 : NODE_RADIUS + 11}
                    textAnchor="middle"
                    className="pointer-events-none select-none fill-foreground font-mono text-[9px]"
                  >
                    {label.length > 16 ? `${label.slice(0, 15)}…` : label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {focusedNode && (
          <div
            role="status"
            className={cn(
              "pointer-events-none absolute bottom-2 left-2 max-w-xs rounded-md border border-border",
              "bg-card px-3 py-2 text-xs shadow-md",
            )}
          >
            <div className="font-medium text-foreground">
              {focusedNode.identifier ? (
                <>
                  <span className="font-mono">{focusedNode.identifier}</span> — {focusedNode.label}
                </>
              ) : (
                focusedNode.label
              )}
            </div>
            <div className="text-muted-foreground">
              {graphNodeTypeLabel(focusedNode.type)} — press Enter to open
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {simNodes.length} objects, {simLinks.length} relationships. Drag to rearrange, scroll or
        pinch to zoom, click or focus-and-Enter a node to open it.
      </p>
    </div>
  );
}
