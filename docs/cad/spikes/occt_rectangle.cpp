// Isolated OCCT feasibility experiment; no application integration.
// Input is four XY vertices in contour order, not a rendered triangle mesh.
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepPrimAPI_MakePrism.hxx>
#include <BRep_Tool.hxx>
#include <GProp_GProps.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Shape.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>
#include <cmath>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <stdexcept>

int main(int argc, char** argv) {
  try {
    if (argc != 11) throw std::runtime_error("expected 8 vertex coordinates, depth, expected volume");
    double v[10];
    for (int i = 0; i < 10; ++i) {
      char* end = nullptr;
      v[i] = std::strtod(argv[i + 1], &end);
      if (*end || end == argv[i + 1] || !std::isfinite(v[i])) throw std::runtime_error("invalid number");
    }
    if (v[8] <= 0 || v[9] <= 0) throw std::runtime_error("invalid depth or volume");
    gp_Pnt p[4] = {{v[0], v[1], 0}, {v[2], v[3], 0}, {v[4], v[5], 0}, {v[6], v[7], 0}};
    BRepBuilderAPI_MakeWire wire;
    for (int i = 0; i < 4; ++i) wire.Add(BRepBuilderAPI_MakeEdge(p[i], p[(i + 1) % 4]).Edge());
    if (!wire.IsDone()) throw std::runtime_error("wire build failed");
    BRepBuilderAPI_MakeFace face(wire.Wire());
    if (!face.IsDone()) throw std::runtime_error("face build failed");
    BRepPrimAPI_MakePrism prism(face.Face(), gp_Vec(0, 0, v[8]));
    if (!prism.IsDone()) throw std::runtime_error("prism build failed");
    TopoDS_Shape solid = prism.Shape();
    BRepCheck_Analyzer valid(solid, true);
    int shells = 0; bool closed = true;
    for (TopExp_Explorer e(solid, TopAbs_SHELL); e.More(); e.Next()) {
      ++shells; closed = closed && BRep_Tool::IsClosed(e.Current());
    }
    GProp_GProps props;
    BRepGProp::VolumeProperties(solid, props);
    double volume = props.Mass();
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(solid, bounds, false, false); // no triangulation
    double xmin, ymin, zmin, xmax, ymax, zmax;
    bounds.Get(xmin, ymin, zmin, xmax, ymax, zmax);
    std::cout << std::setprecision(15) << "solid=" << (solid.ShapeType() == TopAbs_SOLID)
              << " valid=" << valid.IsValid() << " shells=" << shells << " closed=" << closed
              << " extents_mm=" << xmax-xmin << "," << ymax-ymin << "," << zmax-zmin
              << " volume_mm3=" << volume << "\n";
    if (solid.ShapeType() != TopAbs_SOLID || !valid.IsValid() || shells != 1 || !closed ||
        std::abs((xmax-xmin) - (v[2]-v[0])) > 1e-7 ||
        std::abs((ymax-ymin) - (v[5]-v[1])) > 1e-7 ||
        std::abs((zmax-zmin) - v[8]) > 1e-7 || std::abs(volume - v[9]) > 1e-7) return 1;
    return 0;
  } catch (const std::exception& e) {
    std::cerr << e.what() << "\n"; return 1;
  }
}
