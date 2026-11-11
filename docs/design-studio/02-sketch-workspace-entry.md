# Sketch-first Design Studio entry — partial

## Scope

`/designs` is now a sketch-focused entry point instead of the former conceptual-diagram dashboard. It checks the existing CAD API gate, offers creation and recent sketch search only when the API is available, and otherwise states that the experimental workspace is disabled. Its product/project links navigate to existing lifecycle records: they do **not** associate sketches with those records, create project permissions or move data. CAD sketches remain workspace-scoped, and the existing server remains responsible for authorization. The temporary demo cannot access sketches.

When explicitly enabled in isolated development/testing, the existing XY editor supports limited point, line, rectangle and circle geometry, some real constraints and autosave. It remains experimental and is not suitable for production or engineering decisions. There is no production-ready CAD or 3D modelling. The CAD API remains disabled by default; this work does not change its gate, algorithms, migrations, or permissions.

Previously saved conceptual diagrams and direct links are retained without migration, deletion, reassignment or conversion. They are accessible at `/designs/diagrams`; project-associated diagrams remain on the project page. The old workspace-level new-diagram form has been removed from that legacy list; existing project creation paths are unchanged. Neither these diagrams nor the experimental sketch editor is a Fusion-like professional CAD system. Completing the user's request requires production-ready modelling, genuine product/project associations and project-level authorization, broader usability/accessibility testing and further CAD security and numerical validation.

## Safety and test coverage

The new sketch form prevents navigation and session switching while creation is in flight, warns about an unsubmitted name, and warns that a failed response can be ambiguous. A successful create opens the server-returned sketch. No new migration or production configuration is introduced. No data was deleted.

Tests use synthetic fixtures: a browser-only mock checks feature-gate states, preserved diagram access, creation error/in-flight guards, search and responsive widths; a browser integration test uses a real local API with `CAD_NATIVE_EXPERIMENTAL=true` and disposable PostgreSQL to create a sketch, draw an actual rectangle, autosave, reload and verify a prior diagram remains accessible. Existing design API, legacy diagram editor, experimental CAD document and sketch-editor browser regressions also passed, including solver, recovery, conflict and member authorization checks; the default-disabled CAD browser check passed after restarting the test API without the flag. None of these tests uses production. Full CAD and lifecycle integration acceptance is not met.
