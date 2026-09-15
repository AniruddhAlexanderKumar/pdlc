"use client";

import * as React from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SavedView } from "./use-saved-views";

/**
 * Load, save, and delete named filter presets — the URL already makes any
 * single filtered view shareable by link (see `use-url-filter-state.ts`);
 * this is the layer on top for "the ones I come back to," per §2.
 */
export function SavedViewsControl<F>({
  views,
  onLoad,
  onSave,
  onDelete,
  currentFilters,
}: {
  views: SavedView<F>[];
  onLoad: (filters: F) => void;
  onSave: (name: string, filters: F) => void;
  onDelete: (id: string) => void;
  currentFilters: F;
}) {
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [selectedId, setSelectedId] = React.useState("");

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, currentFilters);
    setName("");
    setNaming(false);
  }

  function handleLoad(id: string) {
    setSelectedId(id);
    const view = views.find((v) => v.id === id);
    if (view) onLoad(view.filters);
  }

  if (naming) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSave();
            if (event.key === "Escape") setNaming(false);
          }}
          placeholder="View name…"
          aria-label="New saved view name"
          className="h-8 w-40"
        />
        <Button size="sm" onClick={handleSave} disabled={!name.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {views.length > 0 && (
        <div className="flex items-center gap-1">
          <Select
            aria-label="Saved views"
            className="h-8 w-44"
            value={selectedId}
            onChange={(event) => handleLoad(event.target.value)}
          >
            <option value="">Saved views…</option>
            {views.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </Select>
          {selectedId && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete this saved view"
              title="Delete this saved view"
              onClick={() => {
                onDelete(selectedId);
                setSelectedId("");
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
      <Button size="sm" variant="outline" onClick={() => setNaming(true)}>
        <Bookmark aria-hidden="true" />
        Save current view
      </Button>
    </div>
  );
}
