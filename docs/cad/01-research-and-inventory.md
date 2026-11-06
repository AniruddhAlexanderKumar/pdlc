# Public product research and functional inventory

## Research method and interpretation

**D** = explicitly documented public behavior; **P** = proposed independent specification or expected validation, not a claim about Onshape internals; **U** = needs public documentation or authorized hands-on verification. Priority: E essential, I important, A advanced, F future. Complexity: L low, M medium, H high, VH very high. Priorities and complexity are engineering judgments, not vendor classifications. A stage label is a proposal, not an implementation commitment.

### Primary evidence ledger (accessed 2026-11-04)

- [4](https://cad.onshape.com/help/Content/PartStudio/extrude.htm): D — sketch region/face, New/Add/Remove/Intersect, depth/end conditions, direction and preview.
- [1](https://cad.onshape.com/help/Content/PartStudio/revolve.htm): D — profile, axis, angular/end conditions, solid/surface/thin and result modes.
- [1](https://cad.onshape.com/help/Content/Sketch/sketch_tools.htm): D — sketch creation, entity toolbar, construction, exit tool and sketch-to-feature interaction.
- [2](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm): D — constraints and dimension interaction; underconstrained/fully constrained/problem states and diagnostics.
- [3](https://cad.onshape.com/help/Content/PartStudio/feature_tools.htm) and [6](https://cad.onshape.com/help/Content/PartStudio/feature_basics.htm): D — feature dialog selection, parameters, preview, accept/cancel and undo.
- [4](https://cad.onshape.com/help/Content/PartStudio/features_and_parts_lists.htm): D — chronological feature/part list, rollback, suppress, reordering and cross-highlighting.
- [5](https://cad.onshape.com/help/Content/PartStudio/boolean.htm), [6](https://cad.onshape.com/help/Content/PartStudio/fillet.htm), [7](https://cad.onshape.com/help/Content/PartStudio/sweep.htm), [8](https://cad.onshape.com/help/Content/PartStudio/loft.htm), [3](https://cad.onshape.com/help/Content/PartStudio/chamfer.htm): D — representative operations and user inputs.
- [9](https://cad.onshape.com/help/Content/Assembly/assembly.htm), [10](https://cad.onshape.com/help/Content/Assembly/mates.htm), [11](https://cad.onshape.com/help/Content/Assembly/relations.htm): D — assemblies, part instances, connectors, mates and relations.
- [12](https://cad.onshape.com/help/Content/Drawing/drawings.htm): D — drawing from parts/assemblies; one active editor for a drawing element. Individual drawing-operation semantics require additional verification.
- [13](https://cad.onshape.com/help/Content/Collaboration/sharing_and_collaboration.htm), [14](https://cad.onshape.com/help/Content/Document/versions_and_history.htm), [1](https://cad.onshape.com/help/Content/Document/merging.htm): D — sharing, comments, versions/branches and per-tab merge behavior.
- [1](https://cad.onshape.com/help/Content/View/view_navigation_and_the_view_cube.htm), [4](https://cad.onshape.com/help/Content/View/section_view.htm), [3](https://cad.onshape.com/help/Content/Home/context_menus.htm): D — navigation, section view and contextual commands.
- [15](https://cad.onshape.com/help/Content/File/exporting_files.htm): D — export options vary by object; exported geometry does not carry editable feature history.

Each observed fact refers to the linked public source. Sources describe available behavior, not private implementation, guarantees or all errors; gaps are explicitly marked U. Our product will use original naming, layout, icons and code.

## Inventory and prioritisation

| Subsystem / capability | Priority | Complexity | Evidence / research status |
|---|---|---|---|
| Document list, create/open/rename, ownership and workspace access | E | H | D document/permission concepts in [13](https://cad.onshape.com/help/Content/Collaboration/sharing_and_collaboration.htm); exact UI interactions U |
| Viewport orbit, pan, zoom, fit, axes and orientation presets | E | H | D [1](https://cad.onshape.com/help/Content/View/view_navigation_and_the_view_cube.htm) |
| Object/face/edge/vertex picking, hover, multi-select | E | VH | D view/context patterns [3](https://cad.onshape.com/help/Content/Home/context_menus.htm); all hit disambiguation rules U |
| Sketch plane, line, rectangle, circle, arc, polygon | E | H | D [1](https://cad.onshape.com/help/Content/Sketch/sketch_tools.htm); polygon detailed UI U |
| Spline and construction geometry | I | H | D [1](https://cad.onshape.com/help/Content/Sketch/sketch_tools.htm) |
| Coincident, horizontal, vertical, parallel, perpendicular, equal, tangent, dimensions | E | VH | D [2](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm) |
| Concentric, midpoint, symmetric, fix, normal, pierce, curvature, flow | A | VH | D [2](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm) |
| Constraint status, edit, conflict diagnostics | E | VH | D [2](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm); internal solver U |
| Sketch extrude and revolve (limited blind solid first) | E | VH | D [4](https://cad.onshape.com/help/Content/PartStudio/extrude.htm), [1](https://cad.onshape.com/help/Content/PartStudio/revolve.htm) |
| Feature order, edit, suppression, rollback, dependency-aware regeneration | E | VH | D list and feature UI [4](https://cad.onshape.com/help/Content/PartStudio/features_and_parts_lists.htm); algorithm U |
| Multiple parts, visibility, transforms and reference planes/axes/points | I | H | D list [4](https://cad.onshape.com/help/Content/PartStudio/features_and_parts_lists.htm); individual reference behavior U |
| Boolean union/subtract/intersect | I | VH | D [5](https://cad.onshape.com/help/Content/PartStudio/boolean.htm) |
| Fillet and chamfer | I | VH | D [6](https://cad.onshape.com/help/Content/PartStudio/fillet.htm), [3](https://cad.onshape.com/help/Content/PartStudio/chamfer.htm) |
| Sweep, loft, pattern, mirror, shell, draft, hole | A | VH | D sweep/loft [7](https://cad.onshape.com/help/Content/PartStudio/sweep.htm), [8](https://cad.onshape.com/help/Content/PartStudio/loft.htm); rest detailed validation U |
| Surface modelling and direct face/geometry modification | A | VH | D surface feature types [3](https://cad.onshape.com/help/Content/PartStudio/feature_tools.htm); exact direct edit behavior U |
| Measurements and section visualization | I | H | D [4](https://cad.onshape.com/help/Content/View/section_view.htm); measurement accuracy/details U |
| Assembly instances, hierarchy, reposition and fastened mate | I | VH | D [9](https://cad.onshape.com/help/Content/Assembly/assembly.htm), [10](https://cad.onshape.com/help/Content/Assembly/mates.htm) |
| Revolute, slider, cylindrical, planar mates; offsets/limits | A | VH | D [10](https://cad.onshape.com/help/Content/Assembly/mates.htm); exact DOF for each type to verify |
| Gear relations, exploded view, motion, interference, component configurations | A | VH | D relations [11](https://cad.onshape.com/help/Content/Assembly/relations.htm); detailed other workflows U |
| Drawings: orthographic/isometric, sections/details, dimensions, tolerance, sheets/title blocks, annotation, update/export | A | VH | D drawing capability/single editor [12](https://cad.onshape.com/help/Content/Drawing/drawings.htm); each option and exact update policy U |
| Change history, immutable versions, restore | I | VH | D [14](https://cad.onshape.com/help/Content/Document/versions_and_history.htm) |
| Branch and merge | A | VH | D merge and restrictions [1](https://cad.onshape.com/help/Content/Document/merging.htm) |
| Sharing, ownership, permissions, comments, activity | I | H | D [13](https://cad.onshape.com/help/Content/Collaboration/sharing_and_collaboration.htm); granular policy details U |
| Simultaneous model collaboration | A | VH | D [13](https://cad.onshape.com/help/Content/Collaboration/sharing_and_collaboration.htm); implementation and contention rules U |
| STEP/STL import/export, provenance, deterministic translation | I | VH | D supported exports/history loss [15](https://cad.onshape.com/help/Content/File/exporting_files.htm); exact import options U |
| Other CAD formats, drawing interchange, cloud connections | F | VH | D exports [15](https://cad.onshape.com/help/Content/File/exporting_files.htm); license and import details U |
| Configurations, simulation and engineering analysis, AI-assisted modelling | F | VH | D configurations exposed in [4](https://cad.onshape.com/help/Content/PartStudio/features_and_parts_lists.htm); simulation/AI detailed scope U |
| Sheet metal, custom features, releases and advanced surfaces | F | VH | D vendor has broader tools [3](https://cad.onshape.com/help/Content/PartStudio/feature_tools.htm); not exhaustively inventoried |

## Interaction patterns observed in public documentation

1. **Part studio/sketch:** start sketch, select a plane, use sketch-specific toolbar, create geometry, apply inferred/manual constraints and dimensions, solve, finish sketch. Select a closed region and invoke feature; select references and numerical parameters, preview, accept or cancel. Sketch toolbar can enter extrusion/revolution and accept the sketch. [1](https://cad.onshape.com/help/Content/Sketch/sketch_tools.htm), [4](https://cad.onshape.com/help/Content/PartStudio/extrude.htm).
2. **Feature panel:** selection fields determine what the viewport selection populates; parameter edits can preview; accept commits, cancel discards. The list provides edit, rollback, suppression, reorder and visibility. [3](https://cad.onshape.com/help/Content/PartStudio/feature_tools.htm), [4](https://cad.onshape.com/help/Content/PartStudio/features_and_parts_lists.htm). Proposed: invalid previews show diagnostics and never become committed bodies.
3. **Constraints:** user may select a constraint then entities, or select entities then constraint. Some arise during drawing. Status can be underconstrained, fully constrained or problematic. [2](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm). Proposed: show both text/icon and color; don't depend on color alone.
4. **Assembly:** insert part/subassembly instances, select or create connector coordinate systems, choose a mate, configure orientation/offset/limits, solve/accept. Fastened removes six relative DOF; relations link DOFs of mates. [9](https://cad.onshape.com/help/Content/Assembly/assembly.htm), [10](https://cad.onshape.com/help/Content/Assembly/mates.htm), [11](https://cad.onshape.com/help/Content/Assembly/relations.htm).
5. **Drawings:** a drawing derives from parts or assemblies; drawing-element simultaneous editing is not supported. Versions may warn about stale drawings. [12](https://cad.onshape.com/help/Content/Drawing/drawings.htm), [14](https://cad.onshape.com/help/Content/Document/versions_and_history.htm). Proposed: explicit revision pin and stale marker; no invented associativity.
6. **Versions:** immutable view-only versions and branch workspaces; merging selects source/target and tab-level keep/merge/replace. Drawings lack the same per-tab merge option. [14](https://cad.onshape.com/help/Content/Document/versions_and_history.htm), [1](https://cad.onshape.com/help/Content/Document/merging.htm). We do not assume the same internal algorithm.
7. **Viewport:** camera is independent of geometry; documented presets, view cube and section display. Context menu depends on selected entity and active mode. [1](https://cad.onshape.com/help/Content/View/view_navigation_and_the_view_cube.htm), [4](https://cad.onshape.com/help/Content/View/section_view.htm), [3](https://cad.onshape.com/help/Content/Home/context_menus.htm). Proposed: keyboard-accessible alternative to graphical controls.

## Independent operation contracts (proposed, not implemented)

**Common rule:** every operation requires an authorized editable document and references from the same permitted revision. Store typed feature ID, version, references, dimensional inputs and dependency edges. Preview runs on a scratch snapshot; confirm revalidates against the current revision. Regeneration propagates dirty state to dependents in order. Missing, deleted, ambiguous, invalid or incompatible upstream references yield explicit errors and block affected descendants; never silently bind another entity. All finite-value, unit, solver, geometry-kernel and resource-limit errors are recoverable and preserve the last committed revision. Each row specifies the additional inputs, output and validation; U means vendor edge-case behavior not researched in detail.

| Operation / purpose | Interaction; inputs and parameters → output | Validation, dependencies and upstream behavior | P/C; evidence |
|---|---|---|---|
| Sketch and plane | Choose plane/face → editable 2D frame and entity/constraint set | planar frame, finite invertible transform; lost face blocks sketch; closed non-construction loops required for solids | E/VH; D [1](https://cad.onshape.com/help/Content/Sketch/sketch_tools.htm) |
| Line / rectangle / polygon | Place endpoints or center/corners and sides → line entities with stable IDs | finite distinct endpoints, polygon side count ≥3; retain entity IDs when dimensions change; reject degeneracy | E/H; D line/rectangle; polygon U |
| Circle / arc | Select center/radius or arc points → parametric planar curve | radius positive; non-collinear points when required; invalid trim/profile blocks descendants | E/H; D [1](https://cad.onshape.com/help/Content/Sketch/sketch_tools.htm) |
| Spline / construction | Place control/interpolation points; toggle construction → curve excluded from profiles if construction | finite distinct points, degree and knot validity; altered shape causes contour reevaluation | I/VH; D [1](https://cad.onshape.com/help/Content/Sketch/sketch_tools.htm) |
| Dimensions | Select entities, choose distance/radius/angle, enter value/expression → driving constraint or explicitly reference-only measurement | dimension type/unit, positivity where appropriate, consistency; re-solve and propagate; conflict rejects commit | E/VH; D [2](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm) |
| Coincident, horizontal, vertical | Pick supported points/lines → positional/orientation equations | entity type, nondegenerate line; solver reports infeasible/redundant; editing coordinates re-solves | E/VH; D [2](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm) |
| Parallel, perpendicular, equal | Select lines or compatible curves → directional/length/radius equations | valid types/nonzero lengths; detect redundant or conflicting equations; dependent features use solved sketch | E/VH; D [2](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm) |
| Tangency | Pick compatible lines/arcs/curves → tangency relation | supported contact geometry, singular cases, ambiguity and residual tolerance; new upstream solution may break | E/VH; D [2](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm) |
| Concentric, midpoint, symmetric, fix | Select compatible entities and optional axis → corresponding equations | correct arity/types, nonzero axis, no contradictory fix; re-solve | A/VH; D [2](https://cad.onshape.com/help/Content/Sketch/working_with_constraints.htm) |
| Extrude | Select closed region/face; length, direction, end mode and operation → B-rep solid/surface | valid loop, nonzero finite depth, scope for Boolean modes; changed sketch/plane reruns operation and dependents | E/VH; D [4](https://cad.onshape.com/help/Content/PartStudio/extrude.htm) |
| Revolve | Select closed profile and axis; angle/mode → B-rep | valid profile/axis, angle within supported range, self-intersection checked; upstream profile or axis reevaluates | E/VH; D [1](https://cad.onshape.com/help/Content/PartStudio/revolve.htm) |
| Sweep | Select profile and connected path; orientation/twist/scale → swept body | nondegenerate continuous path/profile, no illegal self-intersection; upstream path/profile changes reevaluate | A/VH; D [7](https://cad.onshape.com/help/Content/PartStudio/sweep.htm) |
| Loft | Select ≥2 ordered profiles and optional guides/continuity → body/surface | compatible contours, guides intersect profiles, valid orientation; changes may fail or remap topology | A/VH; D [8](https://cad.onshape.com/help/Content/PartStudio/loft.htm) |
| Boolean | Select tools/targets and union/subtract/intersect, keep-tools option → result body/bodies | correct body types, operation/scope and intersection policy; kernel failure or topology split blocks dependents | I/VH; D [5](https://cad.onshape.com/help/Content/PartStudio/boolean.htm) |
| Fillet | Select edges/faces and radius (other variants later) → rounded B-rep | radius positive, valid edge and geometry; oversized radius/kernel failure shown; changed edge may become unresolved | I/VH; D [6](https://cad.onshape.com/help/Content/PartStudio/fillet.htm) |
| Chamfer | Select edge, distance(s)/angle → bevel | positive legal distance/angle and compatible geometry; upstream remap or invalid width fails explicitly | I/VH; D [3](https://cad.onshape.com/help/Content/PartStudio/chamfer.htm) |
| Shell | Select body, removed faces, thickness → hollow body | positive feasible thickness, closed/manifold result, correct faces; upstream changes may make wall impossible | A/VH; vendor-specific failures U |
| Draft | Select faces, neutral plane/direction and angle → tapered faces | valid angle, direction and topology; upstream changes may invalidate neutral references | A/VH; detailed vendor behavior U |
| Hole | Select locations/body, size, depth/end mode → cuts | valid dimensions, intersecting target and depth; update on placement/part change | A/VH; detailed vendor behavior U |
| Linear/circular pattern | Select seed, direction/axis, count and spacing/angle → replicated features/parts | count bounded integer, nonzero direction, resource limits, collisions/invalid instances reported; changing seed regenerates instances | A/VH; detailed variant behavior U |
| Mirror | Select seed and plane → reflected geometry/features | valid plane/targets and result validity; changing seed or plane regenerates | A/VH; detailed variant behavior U |
| Transform/direct edit | Select body/faces and translation/rotation or supported face edit → transformed/modified B-rep | valid rigid transform and geometric support, self-intersection check; identity mapping may fail after upstream changes | A/VH; detailed vendor behavior U |
| Planes/axes/points | Select references, offsets, angles or coordinates → construction frame | degeneracy/nonparallel checks; broken reference blocks downstream sketches | I/H; detailed vendor behavior U |
| Measure | Select valid points/edges/faces/bodies → lengths, angles, distances or volume from B-rep | revision-pinned, units and tolerance; never measure display triangles as exact | I/H; detailed vendor behavior U |
| Suppress / rollback / edit | Select feature and command or rollback position → re-evaluated prefix | reject cycles/illegal order; suppressed required dependency marks descendant blocked; undo restores exact prior state | E/VH; D [4](https://cad.onshape.com/help/Content/PartStudio/features_and_parts_lists.htm) |
| Part visibility/selection | Select part or subshape in tree/viewport → selection and visibility state | use permitted current revision IDs, visibility cannot mutate geometry or enable hidden unauthorized data | I/H; D [4](https://cad.onshape.com/help/Content/PartStudio/features_and_parts_lists.htm) |

## Assemblies, drawings and collaboration — independent contracts

| Capability | User interaction → input/output | Validation / upstream propagation | P/C |
|---|---|---|---|
| Insert component / subassembly | Choose permitted part revision and instance transform → instance record | prevent hierarchy cycles; require readable source; missing/purged reference is explicit; source updates are intentional | I/VH |
| Mate connectors | Select geometry or explicit frame on each instance → local coordinate frames | frame valid and same permitted assembly; topology change may invalidate connector; never auto-reattach ambiguously | I/VH |
| Fastened / revolute / slider / cylindrical / planar | Choose two connectors, type, offsets/limits → constrained transforms | diagnose unsatisfiable or redundant constraints, ground reference; enforce per-type DOF and non-inverted limits. Exact vendor semantics of each type U | A/VH |
| Gear relation | Select two compatible rotational DOFs and ratio/direction → relation | finite valid ratio; diagnose solver conflict; referenced mate changes trigger solve | A/VH |
| Exploded view | Define ordered per-instance presentation offsets → view-specific exploded configuration | does not alter actual assembly positions; deleted instance yields explicit stale step | A/H |
| Motion study | Select a supported DOF, bounds/time → kinematic frames | ensure solve at each sample; report singular/infeasible state; no dynamics or collision-safety claim | F/VH |
| Interference | Choose permitted assembly instances → intersecting B-rep pairs and tolerance-qualified overlap | robust broad/narrow phase and contact distinction; current revision only, resource budget and explicit incomplete status | A/VH |
| Assembly configurations | Define variants and overrides → evaluated revision/config | bounded combinations, typed inputs, cycle and missing-reference diagnostics; change invalidates dependent views | A/VH |
| Drawing sheet/title block | Choose template, size, units, model revision → drawing record | version pin, user-provided metadata, no fabricated approval | A/H |
| Orthographic/isometric | Select source and orientation/scale → projected view | exact source revision and projection convention; stale on source change | A/VH |
| Section/detail views | Select parent view and cut/detail boundary → generated view | check crossing/closed boundaries and scale; upstream topology changes mark stale/broken | A/VH |
| Drawing dimensions/annotations/tolerances | Select geometry, position and value/type → associative or explicitly non-associative annotation | valid references/units and constraints; ambiguous updates flag for review, never silently change intent | A/VH |
| Exports | Select permitted revision, object and format → download artifact | disclose lossy formats and units; export only valid evaluated state; history preserved only in own native package | I/VH |
| Sharing/comments | Owner/admin grants scoped access; users comment on revision/entity → auditable records | authorization on every read/write; dangling anchor shown rather than reassigned; no reviewer workspace membership | I/H |
| Version/branch/merge | Snapshot, fork, compare, resolve/commit → immutable revision graph | CAS target/source heads; validate parents, prevent cycles, preserve history; ambiguous conflict requires explicit decision | A/VH |
| Concurrent editing | Two users propose commands from a revision → ordered accepted changes or explicit conflict | serialize per-document commands; no lost updates; permission revocation stops events; presence is ephemeral | A/VH |

## Research gaps before claiming parity

Review the individual official references and conduct authorized account-based tests for every operation variant, snapping, mouse/keyboard profile, tolerance, self-intersection, unsupported body combinations, topology deletion/splitting/merging, inferred vs explicit connector behavior, drawing constraints/updates, export option variants and concurrent conflict handling. No conclusions about internal topology naming, kernel, solver algorithm, event transport or storage are drawn from screenshots or the vendor's marketing. Track results as observed, not assumed, with date and edition where applicable.

## Additional operation coverage and unverified details

The following are **P** specifications and priority estimates; they are not claims that every Onshape variant was personally tested. General validation, regeneration and error semantics above apply to every row. Verify vendor feature availability and exact behavior before making a comparison.

| Operation / purpose | Interaction; inputs → output | Validation / dependencies / upstream changes | P/C |
|---|---|---|---|
| Sketch trim / extend / split | Select curve and trim/extend/split point or boundary → revised sketch entities | intersections must be well defined; preserve entity IDs only for unambiguous descendants, report constraints/references orphaned by trimming | I/VH |
| Sketch offset / mirror / pattern | Select entities, offset distance or mirror axis / direction, count and spacing → new sketch curves and optional relationships | supported curve types, nonzero axis, finite count, no degenerate offsets; changed sources re-solve or flag broken relationships | A/VH |
| Sketch projected/use geometry | Select permitted upstream edge or point and target plane → associative projected entity | plane and geometry compatibility, projected degeneracy and topology reference; upstream topology edits invalidate or update | I/VH |
| Normal / pierce | Select compatible curve/edge/point and support → relation equations | well-defined intersections and tangents; degenerate or no intersection is an error, upstream change re-solves | A/VH |
| Curvature / flow | Select compatible curves and endpoints → higher-order continuity equations | curve derivative availability and nondegenerate curvature; singular/conflicting systems report failure; changed control points re-solve | A/VH |
| Up-to / symmetric / two-sided extrusion | Select region and end face/plane or two signed extents → bounded B-rep | finite and correctly oriented end, valid intersections; changed endpoint or profile forces reevaluation and may fail | I/VH |
| Revolve partial / two-sided / up-to | Select profile, axis and angular bounds / end reference → revolved B-rep | angle range, valid axis/end reference, self-intersection; update on profile/axis/end change | A/VH |
| Surface creation / offset / thicken | Select supported profile/faces, offset or thickness → surface/shell or solid | offset feasibility, continuity, positive thickness, closedness for solid; upstream faces may change or disappear | A/VH |
| Split body / face | Select target and dividing plane/surface/curve → multiple bodies/faces | actual intersection, compatible topology and result validity; stable provenance needed for resulting pieces | A/VH |
| Delete / move / replace / offset face | Select face(s), healing/replacement surface or transform → modified B-rep | valid face set and healing/intersection, no invalid solid; regenerated topology can invalidate dependent references | A/VH |
| Rib / web | Select profile, direction, thickness and target → supported thin-walled solid | valid contact and finite positive thickness; changes to support/profile may make feature fail | A/VH |
| Thread | Select cylindrical geometry, pitch, length and direction → thread representation | distinguish cosmetic annotations from actual helical cut; validate dimensions/intersection and recompute on source edits | F/VH |
| Wrap / emboss / engrave | Select profile, destination face and depth/mapping → modified body | supported mapping and non-self-intersection; changed destination or profile may require manual repair | F/VH |
| Pattern on path | Select seeds/path, spacing/count/orientation → instances | path continuity, count/resource cap and frame singularities; path/seed changes recalculate instances | A/VH |
| Import model | Upload allowed STEP or STL → imported B-rep or explicitly non-editable mesh element | sandbox parser, validate file/units/limits, preserve provenance; imported geometry has no invented feature history | I/VH |
| Rack-and-pinion / screw / linear relations | Select compatible mate DOFs and ratio/pitch/direction → linked kinematics | finite nonzero ratios/pitch where applicable, valid DOFs and constraint consistency; mate deletion/changes block relation | A/VH; D relation types [11](https://cad.onshape.com/help/Content/Assembly/relations.htm) |
| Drawing dimension types / symbols | Select generated view geometry and linear/angular/radial/diameter dimension or annotation → positioned item | references must belong to pinned projection; source change triggers reassociation check; unsupported standards not implied | A/VH |
| Drawing projection / hidden lines | Pick view, angle convention and hidden-line style → projected edges | validate projection and scale; update revision-pinned source; prevent misleading hidden/visible edge classification | A/VH |
| Drawing export | Select current drawing revision, sheet and supported PDF/DXF format → downloadable file | export only valid, revision-labelled projections; report unsupported font/dimension mappings and possible format loss | A/VH |
| Feature variables/configurations | Define named, dimensional expressions and bounded variants → evaluated feature parameters | no cycles, type/unit checking, expression resource limits; changes dirty all consumers and derived drawings | A/VH |
| Mass properties | Select solid(s), optional material/density → volume, centroid and optional mass/inertia | manifold geometry and nonnegative density; missing density gives volume only; recalculate on upstream change, qualify accuracy | A/H |
| View section / clipping | Select plane and orientation → non-destructive clipped display | must be clearly a visualization rather than a model cut; picking, caps and measurement must not invent geometry | I/H; D [4](https://cad.onshape.com/help/Content/View/section_view.htm) |
