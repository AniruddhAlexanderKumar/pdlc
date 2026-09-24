"use client";

import * as React from "react";

interface ParticleNode {
  id: number;
  x: number; // percentage
  y: number; // percentage
  vx: number;
  vy: number;
  label: string;
  type: string;
}

const INITIAL_NODES: ParticleNode[] = [
  { id: 1, x: 15, y: 20, vx: 0.02, vy: 0.01, label: "REQ-1042", type: "REQUIREMENT" },
  { id: 2, x: 35, y: 15, vx: -0.015, vy: 0.02, label: "QST-089", type: "QUESTION" },
  { id: 3, x: 65, y: 25, vx: 0.01, vy: -0.015, label: "EVD-402", type: "EVIDENCE" },
  { id: 4, x: 85, y: 35, vx: -0.02, vy: 0.01, label: "DEC-019", type: "DECISION" },
  { id: 5, x: 25, y: 55, vx: 0.015, vy: -0.02, label: "APP-005", type: "APPROVAL" },
  { id: 6, x: 50, y: 70, vx: -0.01, vy: 0.015, label: "CR-112", type: "CHANGE" },
  { id: 7, x: 75, y: 75, vx: 0.02, vy: -0.01, label: "SUP-014", type: "SUPPLIER" },
  { id: 8, x: 90, y: 85, vx: -0.015, vy: -0.015, label: "ICD-401", type: "INTERFACE" },
];

export function UINatureBackground() {
  const [nodes, setNodes] = React.useState<ParticleNode[]>(INITIAL_NODES);

  // Subtle floating animation loop
  React.useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      setNodes((prevNodes) =>
        prevNodes.map((n) => {
          let newX = n.x + n.vx;
          let newY = n.y + n.vy;

          let newVx = n.vx;
          let newVy = n.vy;

          if (newX <= 5 || newX >= 95) newVx = -newVx;
          if (newY <= 5 || newY >= 95) newVy = -newVy;

          return { ...n, x: newX, y: newY, vx: newVx, vy: newVy };
        })
      );
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [nodes]);

  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-black selection:bg-cyan-500 selection:text-black">
      {/* 1. Subtle UI Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:48px_48px] opacity-25" />

      {/* 2. Radial Ambient Mesh Light */}
      <div className="absolute left-1/2 top-0 size-[1000px] -translate-x-1/2 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-900/15 via-blue-950/5 to-transparent blur-3xl opacity-70" />
      <div className="absolute right-0 bottom-0 size-[800px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-950/20 via-black to-transparent blur-3xl opacity-60" />

      {/* 3. Dynamic Interactive SVG UI Wireframe Mesh */}
      <svg className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="uiMeshLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* Dynamic connection lines between neighboring nodes */}
        {nodes.map((n1, i) =>
          nodes.slice(i + 1).map((n2) => {
            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Connect nodes within proximity threshold
            if (dist < 32) {
              return (
                <line
                  key={`${n1.id}-${n2.id}`}
                  x1={`${n1.x}%`}
                  y1={`${n1.y}%`}
                  x2={`${n2.x}%`}
                  y2={`${n2.y}%`}
                  stroke="url(#uiMeshLineGrad)"
                  strokeWidth="1.2"
                  strokeDasharray="4 4"
                />
              );
            }
            return null;
          })
        )}

        {/* Floating UI Nodes */}
        {nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x * 10}, ${n.y * 10})`}>
            <circle
              cx={`${n.x}%`}
              cy={`${n.y}%`}
              r="4"
              className="fill-cyan-400 opacity-60"
            />
            <circle
              cx={`${n.x}%`}
              cy={`${n.y}%`}
              r="12"
              className="stroke-cyan-500/30 fill-none"
              strokeWidth="1"
            />
          </g>
        ))}
      </svg>

      {/* 4. Monospace Telemetry UI Metadata Overlay */}
      <div className="absolute top-6 left-6 font-mono text-[9px] font-bold text-zinc-600 uppercase tracking-widest flex flex-col gap-1">
        <span>UI_CANVAS // ACTIVE_MESH</span>
        <span>GRID_RES: 48PX • MESH_NODES: 8</span>
      </div>

      <div className="absolute bottom-6 right-6 font-mono text-[9px] font-bold text-zinc-600 uppercase tracking-widest flex flex-col gap-1 text-right">
        <span>MORNINGSTAR_UI_KERNEL v4.2</span>
        <span>STATE: GRAPH_SYNCHRONIZED</span>
      </div>
    </div>
  );
}
