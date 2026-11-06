# First CAD milestone: acceptance, spikes and licensing gate

**Updated 2026-11-04. Status:** the user approved the research direction and first substantive milestone, conditional on completed feasibility spikes and the necessary licensing review **before application implementation**. The experiments below are independent research programs, not application code, a released CAD feature or a production dependency selection. The experiments pass their bounded checks; legal sign-off remains outstanding. Their results do not satisfy the full end-to-end milestone.

This document supersedes broader first-stage proposals in the earlier architecture and roadmap wherever they conflict: the initial product has **one writer, no branches, real-time collaboration, merge, assemblies or advanced modelling**; the only extrusion reference is the supported sketch profile, not arbitrary faces or edges.

## Exact end-to-end milestone acceptance

1. Authenticated user creates a CAD document in their authorized workspace, selects the XY plane and draws **four separately editable connected line segments** in a rectangle. No hardcoded primitive standing in for sketch geometry. Sketch source persists coordinates, stable entity IDs, endpoint connectivity, constraint and dimension records, and the sketch's plane.
2. User applies horizontal and vertical constraints to the appropriate segments, coincident constraints at the corners, anchors one corner to the origin, and enters driving width **10 mm** and height **20 mm**. The solver reports **fully constrained** (zero remaining degrees of freedom and valid residuals). It must distinguish underconstrained, redundant and conflicting constraints; it must not simply set a flag or infer success from appearance.
3. Select the closed sketch profile and extrude **5 mm** along +XY plane normal into an actual kernel-generated, **valid closed B-rep solid**. A sketch/profile identifier is the sole extrusion geometry reference in this milestone. Volume and validity come from the geometric kernel, not from the tessellated display mesh.
4. Edit the original driving width to **12 mm**. The sketch re-solves; dependency invalidation automatically regenerates the extrusion and visual representation from the modified parametric source. User need not redraw or manually replace the solid.
5. Save, close and reopen. Recover editable sketch lines, constraints, dimensions, plane, extrusion parameters and ordered feature history. Discard or ignore the cached evaluated shape and regenerate from the persisted source on reopen; an equivalent valid solid and geometry result must be obtained. The reopened 12 mm dimension must remain editable and changing it back to 10 mm must regenerate correctly.

| Check | Original | After edit |
|---|---:|---:|
| Width | 10 mm | 12 mm |
| Height | 20 mm | 20 mm |
| Extrusion depth | 5 mm | 5 mm |
| Kernel-measured volume | 1,000 mm³ | 1,200 mm³ |
| Solid | one valid, closed B-rep solid | one valid, closed B-rep solid |
| Sketch | four editable line segments, fully constrained | same, width 12 mm |
| Reopen | editable source/history intact and regenerable | editable source/history intact and regenerable |

Test the above with an automated browser/API/database/kernel end-to-end test, including a process restart and a cold regeneration with cached artifacts removed. Compare extents and kernel volume against the analytic values, not a mesh-derived result; assert mesh only visually represents the current evaluated revision. Record the approved kernel/solver version and tolerances used in the test. Also test illegal/nonfinite dimensions, open or degenerate profiles, conflicting constraints, error recovery, cancel preview without a persistent mutation, undo/redo of a dimension edit, and scoped access. A stale/failed evaluation must never be displayed or exported as the new solid. No arbitrary face/edge pick, Boolean, revolve, branch, concurrent edit or unimplemented feature control belongs in this slice.

**Single writer** means one authorized active edit session per document, enforced server-side; another tab/client must be read-only or receive a clear conflict. The server must use an ownership/lease token with fencing to prevent a stale client or expired lease from committing; save commits source atomically, and worker results are bound to their input revision. Reopening after a crash must not depend on a permanently held lease. This is a design requirement, not a claim already implemented.

## Experiment 1 — independent rectangle constraint equations

Source: [`spikes/rectangle_solver.py`](spikes/rectangle_solver.py). Environment: Python 3.11.2, NumPy 2.2.6, SciPy 1.15.3; temporary dependencies only. Eight independent segment endpoints contain 16 scalar unknowns. Four coincident pairs contribute eight equations, two horizontal plus two vertical constraints contribute four, origin anchor contributes two, and signed width and height contribute two. SciPy `least_squares` solves the simultaneous equations; matrix rank is evaluated at the solution. Signed dimensions intentionally keep the specific positive-orientation rectangle; this proof is not general interactive rectangle semantics.

Observed in Linux x86_64 on 2026-11-04:

```text
width=10, height=20: rank=16 dof=0 max_residual=9.31e-25
width=12, height=20: rank=16 dof=0 max_residual=1.78e-15
height omitted: rank=15 dof=1 max_residual=9.87e-14
consistent duplicate width: rank=16 dof=0 max_residual=2.17e-24
contradictory widths 10 and 12: rank=16 dof=0 max_residual=1
```

**Interpretation:** for this bounded system and initialization, the numeric equations solve and demonstrate local rank-based DOF, a redundant equation and an inconsistent set. This is **not** a production solver, a complete redundancy/conflict diagnosis, a guarantee for singularities or scales, or an evaluation of geometric solvers on real sketch workloads. `least_squares` terminates on a compromise for the contradictory case, so the spike rejects it by residual rather than treating solver termination as success. NumPy/SciPy were used only for research; no application solver is selected. Before adoption, compare feasible legally reviewed candidates on a broader corpus including degeneracy, drag initialization, conflicting constraints, sensitivity, rank thresholds, determinism, and practical integration/maintenance.

## Experiment 2 — genuine OCCT B-rep extrusion

Source: [`spikes/occt_rectangle.cpp`](spikes/occt_rectangle.cpp). The solver script can pass its solved corner coordinates to the program. It builds four OCCT edges, a wire and a planar face, then uses `BRepPrimAPI_MakePrism` with the 5 mm normal vector. It checks `TopAbs_SOLID`, `BRepCheck_Analyzer::IsValid`, exactly one shell with `BRep_Tool::IsClosed`, and uses `BRepGProp::VolumeProperties` for volume. `BRepBndLib::AddOptimal` is called with triangulation disabled for extents. This program does not use Three.js, a triangle mesh, a prebuilt box or a hardcoded volume as geometry. Expected values are only test oracles.

Observed with OCCT **7.9.3 shared libraries** contained in the `cadquery-ocp-novtk` **7.9.3.1.1** Linux wheel and 7.9.3 upstream headers, GCC 12.2:

```text
solid=1 valid=1 shells=1 closed=1 extents_mm=10,20,5 volume_mm3=1000
solid=1 valid=1 shells=1 closed=1 extents_mm=12,20,5 volume_mm3=1200
```

Zero extrusion depth is rejected by the spike input check. The native solver-to-kernel experiment passes; it does **not** test browser interaction, durable sketch storage, undo, multi-process reliability, a complete OCCT release build, all invalid inputs, or support for more than this rectangle. These checks do not certify manufacturing accuracy. This experiment links native shared OCCT libraries extracted from the wheel, not its Python wrapper. An attempted wrapper import failed because this environment lacks `libGL.so.1`; that is a real dependency/deployment issue, not evidence of a headless wrapper working. The shared libraries were not built by us, and ABI/source provenance beyond matching the visible 7.9.3 release requires verification before any production use. No decision is made to distribute that wheel.

### Reproduce the experiments (Linux x86_64, Python 3.11, C++17)

These commands download sizable research artifacts to `/tmp`; they do not alter the application or package lock. Inspect and verify artifacts in accordance with your own supply-chain policies first. A different architecture/Python needs matching wheels and hashes. Source links: [OCCT release source](https://github.com/Open-Cascade-SAS/OCCT/tree/V7_9_3), [OCP wrapper source](https://github.com/CadQuery/OCP), [SciPy](https://github.com/scipy/scipy), [NumPy](https://github.com/numpy/numpy).

```bash
python3 -m pip install --no-cache-dir --target /tmp/cad-spike-deps \
  'numpy==2.2.6' 'scipy==1.15.3' 'cadquery-ocp-novtk==7.9.3.1.1'
curl -fsSL https://codeload.github.com/Open-Cascade-SAS/OCCT/tar.gz/refs/tags/V7_9_3 -o /tmp/occt-7.9.3.tar.gz
# The source archive SHA-256 must equal the value in the table below.
sha256sum /tmp/occt-7.9.3.tar.gz
mkdir -p /tmp/occt-source /tmp/occt-include
tar -xzf /tmp/occt-7.9.3.tar.gz -C /tmp/occt-source --strip-components=1
python3 - <<'PY'
from pathlib import Path
src, out = Path('/tmp/occt-source/src'), Path('/tmp/occt-include')
for p in src.rglob('*'):
    if p.is_file() and p.suffix in ('.hxx', '.h', '.lxx', '.gxx'):
        target = out / p.name
        if target.exists():
            raise RuntimeError(f'duplicate header: {p.name}')
        target.symlink_to(p)
PY
LIBS=/tmp/cad-spike-deps/cadquery_ocp_novtk.libs
c++ -std=c++17 -O2 -Wno-deprecated-declarations -I /tmp/occt-include \
  docs/cad/spikes/occt_rectangle.cpp \
  "$LIBS"/libTKPrim-*.so.7.9.3 "$LIBS"/libTKTopAlgo-*.so.7.9.3 \
  "$LIBS"/libTKBRep-*.so.7.9.3 "$LIBS"/libTKG3d-*.so.7.9.3 \
  "$LIBS"/libTKMath-*.so.7.9.3 "$LIBS"/libTKernel-*.so.7.9.3 \
  -Wl,-rpath,"$LIBS" -o /tmp/occt-rectangle
PYTHONPATH=/tmp/cad-spike-deps OPENBLAS_NUM_THREADS=1 \
  python3 -u docs/cad/spikes/rectangle_solver.py /tmp/occt-rectangle
```

Exact artifacts used, hashes obtained from downloaded files (not independently verified upstream signatures):

| Artifact | SHA-256 |
|---|---|
| OCCT `V7_9_3` source archive | `5ecf094ec6b12d5413dfb851d8c3590c354058aee556e32e408bdfbf8c357d57` |
| `cadquery_ocp_novtk-7.9.3.1.1-cp311-cp311-manylinux_2_31_x86_64.whl` | `860649d3d2c2d43eb2068ff604bce198dbebf402eedae496829d12de4107a2f5` |
| `cadquery_ocp_proxy-7.9.3.1.1-py3-none-any.whl` | `ca4164ec4b54956d9fc3e68c67d555b5486cb963c2f71e18df005ba16b921c91` |
| `numpy-2.2.6-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl` | `ba10f8411898fc418a521833e014a77d3ca01c15b0c6cdcce6a0d2897e6dbbdf` |
| `scipy-1.15.3-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl` | `39cb9c62e471b1bb3750066ecc3a3f3052b37751c7c3dfd0fd7e48900ed52982` |

For a repeat run, use clean empty output directories. The packages in `/tmp` are not persisted, committed or included in any application build.

## Dependency and distribution review — **NOT legal approval**

This is technical due diligence to equip the project's authorized legal reviewer. It is not legal advice and cannot substitute for the user's requested licensing review. No counsel or rights holder has approved this project or distribution arrangement. The milestone implementation remains blocked until the necessary review is obtained and recorded.

| Component | Evidence / technical finding | Outstanding review |
|---|---|---|
| OCCT 7.9.3 source / shared libraries | Official [LGPL 2.1 license](https://github.com/Open-Cascade-SAS/OCCT/blob/V7_9_3/LICENSE_LGPL_21.txt) and [Open CASCADE exception](https://github.com/Open-Cascade-SAS/OCCT/blob/V7_9_3/OCCT_LGPL_EXCEPTION.txt); upstream also offers commercial terms. The exception concerns header material in object code and requires a prominent notice, subject to its actual text. | Counsel to determine applicable obligations for exact artifact, edits, notices, source availability, relinking/replacement and dependencies; exception is not a blanket exemption. Establish exact binary-to-source provenance and whether any commercial license is needed. |
| OCP `cadquery-ocp-novtk` wheel | Wheel metadata says Apache-2.0 for wrapper; it bundles many OCCT and third-party shared libraries, and has an embedded SBOM. Wrapper metadata is **not** the license of everything bundled. | Identify versioned OCCT build provenance, all bundled components and licenses, modifications and notices; verify security and license compliance before any distribution. The observed wheel includes components such as FreeImage, OpenJPEG, libpng, fontconfig and FreeType. |
| SciPy 1.15.3 / NumPy 2.2.6 wheels | Wheel metadata provides license texts, including bundled numerical/runtime components; not selected as application dependencies. | If used or distributed, examine the actual wheel licenses and bundled OpenBLAS, GCC runtime and other components, not just top-level BSD terms. |
| SolveSpace / SolveSpaceLib | The [SolveSpaceLib repository](https://github.com/JacobStoren/SolveSpaceLib) declares GPL-3. This spike does not use it. | Review exact candidate/version, linkage and distribution, and project's licensing goals; no assumption that process boundaries erase obligations. |
| Rendering/UI and other future dependencies | No CAD rendering library installed in the product by these spikes. | Exact versions, transitive dependencies and notices must be reviewed before inclusion. |

**Distribution scenarios requiring a written decision:** (a) server-only hosted service; (b) distribution of a server/container image or customer-hosted installation; (c) native binary/static versus dynamic linking; (d) browser-delivered WASM or other client artifacts; (e) any modifications to OCCT; and (f) wheel/bundled third-party dependencies. Deployment topology itself is not a conclusion about licensing. Owner must provide reviewer name/date, approved version and configuration, permitted distribution scenarios, required notices/source/relinking actions, and any restrictions or alternative commercial terms. Until then no application kernel, solver or deployment design is approved solely by this experiment.

## Unrelated language/education change separation

The pre-existing worktree contains unrelated education marketing and language-removal changes. They were not included in these spikes, reverted, or committed. In that existing change set `PATCH /api/auth/language` was removed and the old `apps/server/scripts/language-smoke.mjs`, which expected it to work, was deleted. However, `apps/server/scripts/dashboard-smoke.mjs` still checked **PUT**, not the removed PATCH. Its one-line change now tests the actual removed **PATCH** endpoint and expects 404; it belongs with the unrelated language change, not CAD. Existing legacy database migration/column remain intact.

A disposable PostgreSQL instance with all migrations and a temporary API passed the corrected dashboard integration smoke. `npm test`, `npm run typecheck`, and `node --check` on the smoke script also passed on the combined working tree. These tests do not mean the unrelated changes have been reviewed or merged. Before merging, selectively stage/review separate CAD and education/language changes; do not include this language test correction in a CAD-only commit. No commits or merges have been made.
