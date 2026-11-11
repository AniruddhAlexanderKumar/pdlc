import { createRoot } from "react-dom/client";
import { Designer } from "./Designer";

const root = document.getElementById("product-designer-root");
if (!root) throw new Error("Product designer root not found");
createRoot(root).render(<Designer />);
