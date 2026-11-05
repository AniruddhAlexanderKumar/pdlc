"""Isolated feasibility experiment, not an application sketch solver.

Four distinct line segments = eight independent 2-D endpoint variables. Solve
all constraints at once; the rectangle is not constructed by assigning corners.
Dependencies are temporary: see ../04-spikes-and-license-review.md.
"""
import sys
import subprocess
import numpy as np
from scipy.optimize import least_squares

# Rows are (line-start, line-end), in bottom/right/top/left order.
INITIAL = np.array([[0.8, -0.4], [9.0, 0.4], [10.5, -0.2], [9.4, 18.8],
                    [10.6, 20.7], [0.5, 19.2], [-0.7, 20.3], [-0.2, 0.3]]).ravel()


def residual(v, width=10.0, include_height=True, extra_width=None):
    p = v.reshape(8, 2)
    values = []
    # Each independently modelled end must coincide with the next start.
    for a, b in ((1, 2), (3, 4), (5, 6), (7, 0)):
        values.extend(p[a] - p[b])
    values.extend((p[1, 1] - p[0, 1], p[3, 0] - p[2, 0],
                   p[5, 1] - p[4, 1], p[7, 0] - p[6, 0]))
    values.extend(p[0])  # anchored at origin
    values.append(p[1, 0] - p[0, 0] - width)
    if include_height:
        values.append(p[3, 1] - p[2, 1] - 20.0)
    if extra_width is not None:
        values.append(p[1, 0] - p[0, 0] - extra_width)
    return np.array(values)


def solve(initial, **kw):
    return least_squares(lambda x: residual(x, **kw), initial,
                         xtol=1e-13, ftol=1e-13, gtol=1e-13,
                         max_nfev=300)


def rank(result):
    return int(np.linalg.matrix_rank(result.jac, tol=1e-8))


def summary(name, result):
    print(f'{name}: rank={rank(result)} dof={16-rank(result)} '
          f'max_residual={np.max(np.abs(result.fun)):.3g}')


def main():
    r = solve(INITIAL)
    summary('width=10, height=20', r)
    assert r.success and rank(r) == 16 and np.max(np.abs(r.fun)) < 1e-8
    expected = np.array([[0, 0], [10, 0], [10, 0], [10, 20],
                         [10, 20], [0, 20], [0, 20], [0, 0]])
    assert np.allclose(r.x.reshape(8, 2), expected, atol=1e-8, rtol=0)
    edited = solve(r.x, width=12)
    summary('width=12, height=20', edited)
    assert edited.success and rank(edited) == 16 and np.max(np.abs(edited.fun)) < 1e-8
    assert np.isclose(edited.x[2] - edited.x[0], 12, atol=1e-8)
    under = solve(INITIAL, include_height=False)
    summary('height omitted', under)
    assert rank(under) == 15 and np.max(np.abs(under.fun)) < 1e-8
    duplicate = solve(INITIAL, extra_width=10)
    summary('consistent duplicate width', duplicate)
    assert rank(duplicate) == 16 and len(duplicate.fun) == 17 and np.max(np.abs(duplicate.fun)) < 1e-8
    conflict = solve(INITIAL, extra_width=12)
    summary('contradictory widths 10 and 12', conflict)
    assert np.max(np.abs(conflict.fun)) > 0.9
    if len(sys.argv) == 2:
        for result, volume in ((r, 1000), (edited, 1200)):
            # Line starts in contour order; solved coincidences establish closure.
            coords = result.x.reshape(8, 2)[[0, 2, 4, 6]].ravel()
            subprocess.run([sys.argv[1], *(f'{value:.17g}' for value in coords),
                            '5', str(volume)], check=True)
    elif len(sys.argv) != 1:
        raise SystemExit('usage: rectangle_solver.py [path-to-occt-spike]')
    print('PASS: rectangle equation feasibility only; no general-purpose solver selected')


if __name__ == '__main__':
    main()
