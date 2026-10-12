import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DraggableWidgetGrid from '@/components/ui/draggable-widget-grid';
import { DEFAULT_BOARD, WidgetBoardView } from '@/views/WidgetBoardView';

/**
 * The widget board places tiles with the grid's exact tiler. These tests pin
 * the arrangement (every tile rendered, no overlap, no gaps) and the binding
 * between tiles and the project telemetry contract.
 */

interface Placement {
  id: string;
  col: number;
  row: number;
  w: number;
  h: number;
}

const TILE = /<div[^>]*data-widget-id="([^"]+)"[^>]*>/g;

function placements(html: string): Placement[] {
  const found: Placement[] = [];
  for (const [tag, id] of html.matchAll(TILE)) {
    const col = /grid-column:(\d+) \/ span (\d+)/.exec(tag);
    const row = /grid-row:(\d+) \/ span (\d+)/.exec(tag);
    if (!col || !row) continue;
    found.push({
      id,
      col: Number(col[1]) - 1,
      row: Number(row[1]) - 1,
      w: Number(col[2]),
      h: Number(row[2]),
    });
  }
  return found;
}

const renderBoard = () =>
  renderToStaticMarkup(
    React.createElement(DraggableWidgetGrid, {
      items: DEFAULT_BOARD,
      cellSize: 240,
      renderItem: (item: { id: string }) =>
        React.createElement('span', null, item.id),
    })
  );

/** Shape of `GET /api/v1/projects/:id/telemetry`. */
const TELEMETRY = {
  project: {
    id: 'PRJ-AERO-01',
    name: 'Mass Reduction & Bandwidth Optimization Program',
    description: 'Electromechanical actuator redesign.',
    phase: 'Detailed Design',
    status: 'Active',
  },
  totalReqs: 24,
  allocatedReqs: 22,
  baselinedReqs: 18,
  totalTests: 12,
  passedTests: 9,
  failedTests: 1,
  highRisks: 2,
  openNCs: 1,
  openECRs: 3,
  isReleaseReady: false,
  blockersCount: 2,
  criteria: [
    {
      id: 'GATE-VRF-01',
      name: 'Verification Test Execution Integrity',
      status: 'Blocked',
      details: '1 verification procedure(s) currently in FAILED state (VRF-002).',
      isMandatory: true,
    },
    {
      id: 'GATE-REQ-01',
      name: 'Requirement Architecture Allocation',
      status: 'Met',
      details: 'All 24 requirements successfully allocated.',
      isMandatory: true,
    },
  ],
};

const renderView = (telemetry: unknown) =>
  renderToStaticMarkup(
    React.createElement(WidgetBoardView, {
      telemetry,
      loading: false,
      onNavigate: () => {},
    })
  );

describe('Draggable widget grid tiling', () => {
  it('renders every tile declared in the default board', () => {
    const tiles = placements(renderBoard());
    expect(tiles).toHaveLength(DEFAULT_BOARD.length);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(DEFAULT_BOARD.length);
  });

  it('tiles the board into a gap-free rectangle', () => {
    const tiles = placements(renderBoard());
    const columns = 4;

    const filled = new Set<string>();
    for (const t of tiles) {
      for (let y = t.row; y < t.row + t.h; y++) {
        for (let x = t.col; x < t.col + t.w; x++) {
          // No overlap: each cell is claimed exactly once.
          expect(filled.has(`${x},${y}`)).toBe(false);
          filled.add(`${x},${y}`);
        }
      }
    }

    const rows = Math.max(...tiles.map((t) => t.row + t.h));
    expect(filled.size).toBe(columns * rows);
    expect(filled.size).toBe(16); // 4 × 4 mission-control board
  });

  it('derives four columns from the default cell size and cap', () => {
    const html = renderBoard();
    expect(html).toContain('grid-template-columns:repeat(4, minmax(0, 1fr))');
    // Square-ish cells: before measurement the row height is 0.75 × cellSize.
    expect(html).toContain('grid-auto-rows:minmax(180px, auto)');
  });

  it('keeps tile ids, sizes and labels well formed so layouts stay stable', () => {
    const ids = DEFAULT_BOARD.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const widget of DEFAULT_BOARD) {
      expect(['sm', 'wide', 'tall', 'lg']).toContain(widget.size);
      expect(widget.label).toBeTruthy();
    }
    // Area stays a multiple of the four-column board, so the exact tiler fills it.
    const area = DEFAULT_BOARD.reduce(
      (n, w) => n + (w.size === 'lg' ? 4 : w.size === 'sm' ? 1 : 2),
      0
    );
    expect(area % 4).toBe(0);
  });
});

describe('Engineering widget board view', () => {
  it('binds every tile to authoritative telemetry', () => {
    const html = renderView(TELEMETRY);
    expect(html).toContain('PRJ-AERO-01');
    expect(html).toContain('Mass Reduction');
    expect(html).toContain('92%'); // 22 of 24 requirements allocated
    expect(html).toContain('75%'); // 9 of 12 procedures passed
    expect(html).toContain('GATE-VRF-01');
    expect(html).not.toContain('Authoritative telemetry unavailable');
  });

  it('degrades gracefully when the API is offline', () => {
    const html = renderView(null);
    expect(html).toContain('Authoritative telemetry unavailable');
    expect(html).toContain('API OFFLINE');
    expect(html).toContain('Release gate');
  });
});
