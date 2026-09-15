"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  edgeTypesFrom,
  edgeTypesInto,
  GRAPH_EDGE_DEFINITIONS,
  GRAPH_NODE_TYPES,
  graphEdgeTypeLabel,
  graphNodeTypeLabel,
  type GraphNodeType,
} from "@/domain";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";

/**
 * Every relationship type in and out of a chosen node — read live from
 * `GRAPH_EDGE_DEFINITIONS`, the same authoritative registry the real
 * traversal engine reads. Not a diagram drawn to illustrate the graph —
 * this *is* the graph, the actual 28 node types and every one of their
 * real edges, browsable. If a relationship is added or removed from the
 * registry, this page changes with it automatically; there is nothing
 * here to keep in sync by hand.
 */
export function EdgeRegistryExplorer() {
  const [nodeType, setNodeType] = React.useState<GraphNodeType>("REQUIREMENT");

  const outgoing = React.useMemo(() => edgeTypesFrom(nodeType), [nodeType]);
  const incoming = React.useMemo(() => edgeTypesInto(nodeType), [nodeType]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="edge-explorer-node" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Choose a node type ({GRAPH_NODE_TYPES.length} in the registry)
        </label>
        <Select
          id="edge-explorer-node"
          className="w-full sm:w-72"
          value={nodeType}
          onChange={(event) => setNodeType(event.target.value as GraphNodeType)}
        >
          {GRAPH_NODE_TYPES.map((type) => (
            <option key={type} value={type}>
              {graphNodeTypeLabel(type)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EdgeList
          heading={`Out of ${graphNodeTypeLabel(nodeType)}`}
          icon={<ArrowRight className="size-3.5" aria-hidden="true" />}
          edgeTypes={outgoing}
          readAs={(meaning) => meaning}
        />
        <EdgeList
          heading={`Into ${graphNodeTypeLabel(nodeType)}`}
          icon={<ArrowLeft className="size-3.5" aria-hidden="true" />}
          edgeTypes={incoming}
          readAs={(meaning) => meaning}
        />
      </div>

      {outgoing.length === 0 && incoming.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {graphNodeTypeLabel(nodeType)} has no registered edges in either direction.
        </p>
      )}
    </div>
  );
}

function EdgeList({
  heading,
  icon,
  edgeTypes,
  readAs,
}: {
  heading: string;
  icon: React.ReactNode;
  edgeTypes: ReturnType<typeof edgeTypesFrom>;
  readAs: (meaning: string) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {heading}
        <span className="font-mono normal-case tracking-normal">({edgeTypes.length})</span>
      </h3>
      {edgeTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {edgeTypes.map((type) => {
            const def = GRAPH_EDGE_DEFINITIONS[type];
            return (
              <li key={type} className="rounded-md border border-border p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-medium text-foreground">{graphEdgeTypeLabel(type)}</span>
                  {def.hasNote && (
                    <Badge variant="outline" className="text-[10px]">
                      note
                    </Badge>
                  )}
                  {def.hasLinkType && (
                    <Badge variant="outline" className="text-[10px]">
                      typed
                    </Badge>
                  )}
                  {def.uniquePerPair && (
                    <Badge variant="outline" className="text-[10px]">
                      at most one per pair
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{readAs(def.meaning)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  → {def.targets.map((t) => graphNodeTypeLabel(t)).join(", ")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
