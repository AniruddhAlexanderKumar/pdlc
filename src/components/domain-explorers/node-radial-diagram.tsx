"use client";

import * as React from "react";
import { GRAPH_EDGE_DEFINITIONS, graphNodeTypeLabel, type GraphEdgeType, type GraphNodeType } from "@/domain";

const MAX_PER_SIDE = 6;
const WIDTH = 640;
const HEIGHT = 300;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const SIDE_X_OFFSET = 210;
const NODE_RADIUS = 34;

/** Deterministic connected-node positions in one column, evenly spaced top to bottom. */
function columnPositions(count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [CENTER_Y];
  const top = 40;
  const bottom = HEIGHT - 40;
  const step = (bottom - top) / (count - 1);
  return Array.from({ length: count }, (_, i) => top + step * i);
}

/**
 * A real, deterministic diagram — not physics, not decoration. Positions
 * are computed once from sorted, deduplicated node-type lists, so the same
 * selection always draws in the same place; nothing here simulates or
 * settles. Purely additional to the text lists beside it, which remain the
 * full, unsummarized record — this exists to make the shape of "one node,
 * many real relationships" visible at a glance, and discloses when it has
 * cut the list down rather than silently dropping entries.
 */
export function NodeRadialDiagram({
  nodeType,
  outgoing,
  incoming,
}: {
  nodeType: GraphNodeType;
  outgoing: readonly GraphEdgeType[];
  incoming: readonly GraphEdgeType[];
}) {
  const outgoingTargets = React.useMemo(() => uniqueTargets(outgoing), [outgoing]);
  const incomingSources = React.useMemo(() => uniqueSources(incoming), [incoming]);

  const shownOutgoing = outgoingTargets.slice(0, MAX_PER_SIDE);
  const shownIncoming = incomingSources.slice(0, MAX_PER_SIDE);
  const outgoingPositions = columnPositions(shownOutgoing.length);
  const incomingPositions = columnPositions(shownIncoming.length);

  const rightX = CENTER_X + SIDE_X_OFFSET;
  const leftX = CENTER_X - SIDE_X_OFFSET;

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${graphNodeTypeLabel(nodeType)} connects to ${incomingSources.length} node type(s) inbound and ${outgoingTargets.length} outbound`}
        className="w-full text-muted-foreground"
      >
        {/* Lines first, so nodes paint on top */}
        {shownIncoming.map((_, i) => (
          <line
            key={`in-line-${i}`}
            x1={leftX + NODE_RADIUS}
            y1={incomingPositions[i] ?? CENTER_Y}
            x2={CENTER_X - 60}
            y2={CENTER_Y}
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeWidth={1.5}
          />
        ))}
        {shownOutgoing.map((_, i) => (
          <line
            key={`out-line-${i}`}
            x1={CENTER_X + 60}
            y1={CENTER_Y}
            x2={rightX - NODE_RADIUS}
            y2={outgoingPositions[i] ?? CENTER_Y}
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeWidth={1.5}
          />
        ))}

        {/* Incoming source nodes */}
        {shownIncoming.map((type, i) => (
          <NodeChip key={`in-${type}`} x={leftX} y={incomingPositions[i] ?? CENTER_Y} label={graphNodeTypeLabel(type)} />
        ))}

        {/* Outgoing target nodes */}
        {shownOutgoing.map((type, i) => (
          <NodeChip key={`out-${type}`} x={rightX} y={outgoingPositions[i] ?? CENTER_Y} label={graphNodeTypeLabel(type)} />
        ))}

        {/* Center node — the selection */}
        <g>
          <rect
            x={CENTER_X - 70}
            y={CENTER_Y - 22}
            width={140}
            height={44}
            rx={6}
            className="fill-primary"
          />
          <text
            x={CENTER_X}
            y={CENTER_Y + 5}
            textAnchor="middle"
            className="fill-primary-foreground text-[13px] font-semibold"
          >
            {graphNodeTypeLabel(nodeType)}
          </text>
        </g>
      </svg>
      <figcaption className="flex flex-wrap justify-center gap-x-4 text-[11px] text-muted-foreground">
        {incomingSources.length > MAX_PER_SIDE && (
          <span>+{incomingSources.length - MAX_PER_SIDE} more inbound node type(s), not drawn — see the list below</span>
        )}
        {outgoingTargets.length > MAX_PER_SIDE && (
          <span>+{outgoingTargets.length - MAX_PER_SIDE} more outbound node type(s), not drawn — see the list below</span>
        )}
      </figcaption>
    </figure>
  );
}

function NodeChip({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={NODE_RADIUS} className="fill-card stroke-border" strokeWidth={1.5} />
      <foreignObject x={x - NODE_RADIUS} y={y - NODE_RADIUS} width={NODE_RADIUS * 2} height={NODE_RADIUS * 2}>
        <div className="flex size-full items-center justify-center p-1 text-center text-[9px] font-medium leading-tight text-foreground">
          {label}
        </div>
      </foreignObject>
    </g>
  );
}

/** Unique target node types across a list of outgoing edge types, in registry order. */
function uniqueTargets(edgeTypes: readonly GraphEdgeType[]): GraphNodeType[] {
  const seen = new Set<GraphNodeType>();
  const result: GraphNodeType[] = [];
  for (const type of edgeTypes) {
    for (const target of GRAPH_EDGE_DEFINITIONS[type].targets) {
      if (!seen.has(target)) {
        seen.add(target);
        result.push(target);
      }
    }
  }
  return result;
}

/** Unique source node types across a list of incoming edge types, in registry order. */
function uniqueSources(edgeTypes: readonly GraphEdgeType[]): GraphNodeType[] {
  const seen = new Set<GraphNodeType>();
  const result: GraphNodeType[] = [];
  for (const type of edgeTypes) {
    const source = GRAPH_EDGE_DEFINITIONS[type].source;
    if (!seen.has(source)) {
      seen.add(source);
      result.push(source);
    }
  }
  return result;
}
