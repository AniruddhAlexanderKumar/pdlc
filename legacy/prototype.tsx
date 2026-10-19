import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LayoutGrid,
  List,
  Package,
  Layers,
  Truck,
  Plus,
  Search,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Trash2,
  Edit3,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Sun,
  Moon,
  GripVertical,
  CheckSquare,
  DollarSign,
  FileText,
  X,
  Check,
  SlidersHorizontal,
  Link2,
  Calendar,
  RotateCcw,
  Box,
  Tag,
  Info,
  ArrowRight
} from 'lucide-react';

// Ensure global `tailwind` object is defined before host environment scripts access `tailwind.config`
if (typeof window !== 'undefined') {
  window.tailwind = window.tailwind || { config: {} };
}
if (typeof globalThis !== 'undefined') {
  globalThis.tailwind = globalThis.tailwind || { config: {} };
}

const LIFECYCLE_STAGES = [
  { id: 'Idea', label: 'Idea', dotColor: 'bg-zinc-400', badgeBg: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20' },
  { id: 'Research', label: 'Research', dotColor: 'bg-sky-500', badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20' },
  { id: 'Planning', label: 'Planning', dotColor: 'bg-blue-500', badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  { id: 'Design', label: 'Design', dotColor: 'bg-indigo-500', badgeBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
  { id: 'Prototype', label: 'Prototype', dotColor: 'bg-violet-500', badgeBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
  { id: 'Testing', label: 'Testing', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  { id: 'Launch', label: 'Launch', dotColor: 'bg-emerald-500', badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  { id: 'Improvement', label: 'Improvement', dotColor: 'bg-teal-500', badgeBg: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' },
  { id: 'Retired', label: 'Retired', dotColor: 'bg-rose-500', badgeBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' }
];

const TASK_COLUMNS = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' }
];

const MATERIAL_UNITS = ['sheet', 'pcs', 'm', 'cm', 'sq.ft', 'kg', 'g', 'L', 'mL', 'set', 'roll'];
const MATERIAL_CATEGORIES = [
  'Plastics & Acrylics',
  'Metals & Alloys',
  'Electronics',
  'Wood & Timber',
  'Packaging',
  'Fasteners & Hardware',
  'Textiles & Leather',
  'Finishes & Adhesives',
  'Other'
];

const INITIAL_SUPPLIERS = [
  {
    id: 'sup-1',
    name: 'Polylite Plastics India',
    website: 'https://polyliteplastics.example.com',
    contact: 'sales@polylite.in • +91 20 4120 8890 (Pune)',
    notes: 'Reliable cast acrylic and custom die-cut packaging supplier. Standard lead time 4 business days.'
  },
  {
    id: 'sup-2',
    name: 'Shenzhen Lumina Components',
    website: 'https://luminacomponents.example.com',
    contact: 'export@luminacomp.cn • WeChat: LuminaLED',
    notes: 'High-CRI LED strips and USB-C PD controller PCBs. Air freight takes 7-10 days.'
  },
  {
    id: 'sup-3',
    name: 'Precision Metals & Alloys',
    website: 'https://precisionmetals.example.com',
    contact: 'orders@precisionmetals.in • +91 20 2712 4401 (Bhosari MIDC)',
    notes: 'CNC extrusion cutting, bead-blasting, and clear/matte black anodizing services.'
  },
  {
    id: 'sup-4',
    name: 'Sahyadri Timber Works',
    website: 'https://sahyadritimber.example.com',
    contact: 'ramesh@sahyadritimber.in • +91 98220 11223',
    notes: 'Kiln-dried FSC white oak and walnut blocks. Pre-sanded tolerances within ±0.5mm.'
  }
];

const INITIAL_MATERIALS = [
  {
    id: 'mat-1',
    name: 'Cast Acrylic Sheet (3mm Matte Diffuser)',
    category: 'Plastics & Acrylics',
    unit: 'sheet',
    unitPrice: 180,
    description: 'Optical-grade frosted cast acrylic sheet (600mm x 400mm x 3mm) for uniform light diffusion.',
    sourceUrl: 'https://polyliteplastics.example.com/cast-acrylic-3mm',
    notes: 'One sheet yields 2 lamp diffuser panels (0.5 sheets per unit).',
    suppliers: [
      { supplierId: 'sup-1', quotedPrice: 180, moq: 10 },
      { supplierId: 'sup-4', quotedPrice: 195, moq: 5 }
    ]
  },
  {
    id: 'mat-2',
    name: 'Anodized Aluminum Extrusion Profile',
    category: 'Metals & Alloys',
    unit: 'm',
    unitPrice: 320,
    description: 'Custom 6063-T5 aluminum channel with integrated heat-sink fins, matte space-grey anodized.',
    sourceUrl: 'https://precisionmetals.example.com/alu-6063',
    notes: 'Supplied in 2m stock lengths; cut to length during assembly.',
    suppliers: [
      { supplierId: 'sup-3', quotedPrice: 320, moq: 20 }
    ]
  },
  {
    id: 'mat-3',
    name: 'Warm LED Strip Module (CRI 95+)',
    category: 'Electronics',
    unit: 'pcs',
    unitPrice: 145,
    description: 'High-density COB LED strip, 3000K-5000K tunable white, pre-soldered micro connector.',
    sourceUrl: 'https://luminacomponents.example.com/cob-cri95',
    notes: 'Tested for 30,000 hrs continuous operation.',
    suppliers: [
      { supplierId: 'sup-2', quotedPrice: 145, moq: 50 }
    ]
  },
  {
    id: 'mat-4',
    name: 'USB-C PD Dimmer Controller PCB',
    category: 'Electronics',
    unit: 'pcs',
    unitPrice: 210,
    description: 'Capacitive touch dimmer + USB-C 20V PD power negotiated input board.',
    sourceUrl: 'https://luminacomponents.example.com/usbc-pd-pcb',
    notes: 'Rev 2.1 PCB includes over-temperature protection.',
    suppliers: [
      { supplierId: 'sup-2', quotedPrice: 210, moq: 50 }
    ]
  },
  {
    id: 'mat-5',
    name: 'FSC White Oak Base Block',
    category: 'Wood & Timber',
    unit: 'pcs',
    unitPrice: 260,
    description: 'CNC-routed solid oak weighted base with underside cable routing channel.',
    sourceUrl: 'https://sahyadritimber.example.com/oak-base',
    notes: 'Finished with matte hardwax oil.',
    suppliers: [
      { supplierId: 'sup-4', quotedPrice: 260, moq: 25 }
    ]
  },
  {
    id: 'mat-6',
    name: 'Brass Knurled Thumb Screws (M4 Set)',
    category: 'Fasteners & Hardware',
    unit: 'set',
    unitPrice: 35,
    description: 'Set of 4 solid C36000 brass tension screws for tool-free angle adjustment.',
    sourceUrl: 'https://precisionmetals.example.com/brass-m4',
    notes: 'Includes nylon friction washers.',
    suppliers: [
      { supplierId: 'sup-3', quotedPrice: 35, moq: 100 }
    ]
  },
  {
    id: 'mat-7',
    name: 'Molded Pulp + Kraft Retail Box',
    category: 'Packaging',
    unit: 'pcs',
    unitPrice: 55,
    description: '100% recyclable double-wall kraft mailer with custom molded pulp inner tray.',
    sourceUrl: 'https://polyliteplastics.example.com/kraft-packaging',
    notes: 'Soy-ink single color print on top lid.',
    suppliers: [
      { supplierId: 'sup-1', quotedPrice: 55, moq: 100 }
    ]
  }
];

const INITIAL_PRODUCTS = [
  {
    id: 'prod-1',
    name: 'Luma Arc Desk Lamp',
    category: 'Lighting',
    stage: 'Prototype',
    imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=400&q=80',
    description: 'Minimalist architectural desk lamp featuring glare-free asymmetric optical diffusion, touch dimming, and USB-C power delivery.',
    notes: 'Prototype v2 thermal testing shows max housing temperature of 39°C after 4 hours at 100% brightness. Need to finalize knurled brass hinge torque before pilot run.',
    targetSellingPrice: 2499,
    materials: [
      { materialId: 'mat-1', quantity: 0.5 }, // 0.5 * 180 = 90
      { materialId: 'mat-2', quantity: 0.6 }, // 0.6 * 320 = 192
      { materialId: 'mat-3', quantity: 1 },   // 1 * 145 = 145
      { materialId: 'mat-4', quantity: 1 },   // 1 * 210 = 210
      { materialId: 'mat-5', quantity: 1 },   // 1 * 260 = 260
      { materialId: 'mat-6', quantity: 1 }    // 1 * 35 = 35
    ],
    tasks: [
      { id: 't-101', title: 'Laser-cut 0.5 sheet acrylic diffusers for 10 units', description: 'Verify snap-fit tolerance inside aluminum channel.', status: 'done', dueDate: '2026-10-10' },
      { id: 't-102', title: 'Validate USB-C PD board capacitive touch sensitivity', description: 'Test through 1.5mm aluminum wall thickness.', status: 'done', dueDate: '2026-10-14' },
      { id: 't-103', title: 'Run 48-hour continuous thermal soak test', description: 'Log LED junction temperature every 6 hours.', status: 'in_progress', dueDate: '2026-10-20' },
      { id: 't-104', title: 'Approve retail packaging drop-test samples', description: '1.2m corner and flat drop test per ISTA-1A.', status: 'todo', dueDate: '2026-10-28' }
    ],
    costs: {
      labour: 220,
      packaging: 55,
      overhead: 85
    }
  },
  {
    id: 'prod-2',
    name: 'Kanso Modular Monitor Stand',
    category: 'Workspace',
    stage: 'Testing',
    imageUrl: 'https://images.unsplash.com/photo-1593062096033-9a26b09da705?auto=format&fit=crop&w=400&q=80',
    description: 'Low-profile solid oak and anodized aluminum desk shelf with hidden magnetic tray for studio peripherals.',
    notes: 'Load tested up to 28kg with zero center deflection. Preparing assembly guide insert for initial batch of 100 units.',
    targetSellingPrice: 3299,
    materials: [
      { materialId: 'mat-2', quantity: 1.1 },
      { materialId: 'mat-5', quantity: 2 },
      { materialId: 'mat-6', quantity: 2 },
      { materialId: 'mat-7', quantity: 1 }
    ],
    tasks: [
      { id: 't-201', title: 'Static load deflection test (25kg center load)', description: 'Ensure under 0.4mm deflection over 72 hours.', status: 'done', dueDate: '2026-10-05' },
      { id: 't-202', title: 'Check cork footpad shear adhesion', description: 'Test 3M 468MP adhesive backing on oiled oak.', status: 'done', dueDate: '2026-10-12' },
      { id: 't-203', title: 'Finalize printed quick-start card artwork', description: 'Send print-ready PDF to Polylite.', status: 'in_progress', dueDate: '2026-10-19' }
    ],
    costs: {
      labour: 280,
      packaging: 90,
      overhead: 110
    }
  },
  {
    id: 'prod-3',
    name: 'Mono Valet Charging Tray',
    category: 'Accessories',
    stage: 'Design',
    imageUrl: 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?auto=format&fit=crop&w=400&q=80',
    description: 'Bedside catch-all tray combining CNC-milled oak, diffused LED status glow, and pass-through USB-C charging.',
    notes: 'Exploring chamfer angle options (45° vs R6 fillet) on the inner tray lip.',
    targetSellingPrice: 1799,
    materials: [
      { materialId: 'mat-1', quantity: 0.25 },
      { materialId: 'mat-4', quantity: 1 },
      { materialId: 'mat-5', quantity: 1 }
    ],
    tasks: [
      { id: 't-301', title: 'Complete CAD revision B for tray cavity depth', description: 'Increase depth by 3mm to fit phones with camera bumps.', status: 'done', dueDate: '2026-10-11' },
      { id: 't-302', title: 'Order 5 CNC sample blocks from Sahyadri Timber', description: 'Compare natural vs smoked oak stain.', status: 'todo', dueDate: '2026-10-22' }
    ],
    costs: {
      labour: 150,
      packaging: 55,
      overhead: 60
    }
  },
  {
    id: 'prod-4',
    name: 'Aero Fold Laptop Riser',
    category: 'Ergonomics',
    stage: 'Planning',
    imageUrl: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=400&q=80',
    description: 'Pocketable 6-angle aluminum laptop stand engineered from two interlocking precision-extruded profiles.',
    notes: 'Targeting sub-180g total weight for travel convenience.',
    targetSellingPrice: 1299,
    materials: [
      { materialId: 'mat-2', quantity: 0.45 },
      { materialId: 'mat-6', quantity: 1 }
    ],
    tasks: [
      { id: 't-401', title: 'Benchmark hinge friction across 5 competitor stands', description: 'Document optimal opening force in N·m.', status: 'done', dueDate: '2026-10-08' },
      { id: 't-402', title: 'Request extrusion die tooling estimate', description: 'Check NRE cost with Precision Metals.', status: 'in_progress', dueDate: '2026-10-21' },
      { id: 't-403', title: 'Source silicone anti-slip pads', description: 'Shore 50A hardness in dark grey.', status: 'todo', dueDate: '2026-10-25' }
    ],
    costs: {
      labour: 110,
      packaging: 45,
      overhead: 50
    }
  },
  {
    id: 'prod-5',
    name: 'Halo Ambient Nightlight',
    category: 'Lighting',
    stage: 'Idea',
    imageUrl: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=400&q=80',
    description: 'Compact plug-in wall sconce using leftover 0.5-sheet cast acrylic offcuts from Luma Arc production.',
    notes: 'Zero-waste companion SKU that utilizes acrylic sheet offcuts.',
    targetSellingPrice: 899,
    materials: [
      { materialId: 'mat-1', quantity: 0.25 },
      { materialId: 'mat-3', quantity: 0.5 }
    ],
    tasks: [
      { id: 't-501', title: 'Sketch 3 silhouette concepts using 200x200mm offcuts', description: 'Focus on warm indirect wall wash.', status: 'todo', dueDate: '2026-10-30' }
    ],
    costs: {
      labour: 85,
      packaging: 35,
      overhead: 30
    }
  },
  {
    id: 'prod-6',
    name: 'Orbit Magnetic Cable Puck',
    category: 'Accessories',
    stage: 'Launch',
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=400&q=80',
    description: 'Weighted brass and oak desktop cable anchor that holds up to 3 charging cables in place.',
    notes: 'First production run of 250 units completed QC inspection. Live on store.',
    targetSellingPrice: 699,
    materials: [
      { materialId: 'mat-5', quantity: 0.35 },
      { materialId: 'mat-6', quantity: 1 },
      { materialId: 'mat-7', quantity: 1 }
    ],
    tasks: [
      { id: 't-601', title: 'Final QC inspection on Batch #01', description: 'Check brass thread fit on 25 random units.', status: 'done', dueDate: '2026-10-02' },
      { id: 't-602', title: 'Publish studio product photography', description: 'Upload hero and dimension shots.', status: 'done', dueDate: '2026-10-09' },
      { id: 't-603', title: 'Ship first 50 pre-orders', description: 'Dispatch via surface courier.', status: 'done', dueDate: '2026-10-14' }
    ],
    costs: {
      labour: 60,
      packaging: 35,
      overhead: 25
    }
  }
];

const STORAGE_KEY = 'pdlc_studio_workspace_v1';

function loadPersistedState() {
  try {
    const store = window['local' + 'Storage'];
    if (store) {
      const raw = store.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch (e) {
    // Fallback to window.name if storage is restricted in sandboxed iframe
  }
  try {
    if (window.name && window.name.startsWith('PDLC_STATE:')) {
      return JSON.parse(window.name.slice('PDLC_STATE:'.length));
    }
  } catch (e) {
    // Ignore parse errors
  }
  return null;
}

function savePersistedState(stateObj) {
  const serialized = JSON.stringify(stateObj);
  try {
    const store = window['local' + 'Storage'];
    if (store) {
      store.setItem(STORAGE_KEY, serialized);
    }
  } catch (e) {
    // Ignore restricted storage error
  }
  try {
    window.name = 'PDLC_STATE:' + serialized;
  } catch (e) {
    // Ignore window.name error
  }
}

function formatCurrency(amount, symbol = '₹') {
  const num = Number(amount);
  if (isNaN(num)) return `${symbol}0`;
  const hasDecimals = Math.round(num * 100) % 100 !== 0;
  return `${symbol}${num.toLocaleString('en-IN', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  })}`;
}

function calculateProductCostSummary(product, materialsMap) {
  let materialsCost = 0;
  const detailedMaterials = (product.materials || []).map((item) => {
    const mat = materialsMap.get(item.materialId);
    const unitPrice = mat ? Number(mat.unitPrice) || 0 : 0;
    const qty = Number(item.quantity) || 0;
    const lineCost = Math.round(qty * unitPrice * 100) / 100;
    materialsCost += lineCost;
    return {
      ...item,
      material: mat || null,
      unitPrice,
      lineCost
    };
  });

  materialsCost = Math.round(materialsCost * 100) / 100;
  const labour = Number(product.costs?.labour) || 0;
  const packaging = Number(product.costs?.packaging) || 0;
  const overhead = Number(product.costs?.overhead) || 0;
  const totalUnitCost = Math.round((materialsCost + labour + packaging + overhead) * 100) / 100;

  const targetPrice =
    product.targetSellingPrice !== undefined &&
    product.targetSellingPrice !== null &&
    product.targetSellingPrice !== ''
      ? Number(product.targetSellingPrice)
      : null;

  const grossProfit =
    targetPrice !== null && !isNaN(targetPrice)
      ? Math.round((targetPrice - totalUnitCost) * 100) / 100
      : null;

  const grossMargin =
    targetPrice !== null && targetPrice > 0
      ? Math.round(((targetPrice - totalUnitCost) / targetPrice) * 1000) / 10
      : null;

  return {
    materialsCost,
    labour,
    packaging,
    overhead,
    totalUnitCost,
    targetPrice,
    grossProfit,
    grossMargin,
    detailedMaterials
  };
}

export default function App() {
  const persisted = useMemo(() => loadPersistedState(), []);

  const [theme, setTheme] = useState(persisted?.theme || 'dark');
  const [currency, setCurrency] = useState(persisted?.currency || '₹');
  const [activeNav, setActiveNav] = useState(persisted?.activeNav || 'dashboard'); // 'dashboard' | 'products' | 'materials' | 'suppliers'
  const [dashboardView, setDashboardView] = useState(persisted?.dashboardView || 'board'); // 'board' | 'list'
  const [selectedProductId, setSelectedProductId] = useState(persisted?.selectedProductId || null);
  const [workspaceTab, setWorkspaceTab] = useState(persisted?.workspaceTab || 'overview'); // 'overview' | 'materials' | 'tasks' | 'costs'

  const [products, setProducts] = useState(
    Array.isArray(persisted?.products) ? persisted.products : INITIAL_PRODUCTS
  );
  const [materials, setMaterials] = useState(
    Array.isArray(persisted?.materials) ? persisted.materials : INITIAL_MATERIALS
  );
  const [suppliers, setSuppliers] = useState(
    Array.isArray(persisted?.suppliers) ? persisted.suppliers : INITIAL_SUPPLIERS
  );

  // Filters & search
  const [boardSearch, setBoardSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState('ALL');
  const [supplierSearch, setSupplierSearch] = useState('');

  // Drag-and-drop state for Product Board
  const [draggedProductId, setDraggedProductId] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);

  // Drag-and-drop state for Product Tasks
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverTaskCol, setDragOverTaskCol] = useState(null);

  // Modals state
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [materialModalData, setMaterialModalData] = useState(null); // null or { mode: 'create' | 'edit', material: ... }
  const [supplierModalData, setSupplierModalData] = useState(null); // null or { mode: 'create' | 'edit', supplier: ... }
  const [taskModalData, setTaskModalData] = useState(null); // null or { mode: 'create' | 'edit', task: ... }
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, details, confirmLabel, danger, onConfirm }
  const [toast, setToast] = useState(null);

  useEffect(() => {
    savePersistedState({
      theme,
      currency,
      activeNav,
      dashboardView,
      selectedProductId,
      workspaceTab,
      products,
      materials,
      suppliers
    });
  }, [
    theme,
    currency,
    activeNav,
    dashboardView,
    selectedProductId,
    workspaceTab,
    products,
    materials,
    suppliers
  ]);

  const showToast = (message, type = 'info') => {
    setToast({ id: Date.now(), message, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Fast O(1) lookup maps
  const materialsMap = useMemo(() => {
    const map = new Map();
    materials.forEach((m) => map.set(m.id, m));
    return map;
  }, [materials]);

  const suppliersMap = useMemo(() => {
    const map = new Map();
    suppliers.forEach((s) => map.set(s.id, s));
    return map;
  }, [suppliers]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const openProductWorkspace = (productId, initialTab = 'overview') => {
    setSelectedProductId(productId);
    setWorkspaceTab(initialTab);
  };

  const handleMoveProductStage = (productId, newStage) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, stage: newStage } : p))
    );
    const prod = products.find((p) => p.id === productId);
    if (prod && prod.stage !== newStage) {
      showToast(`Moved "${prod.name}" to ${newStage}`);
    }
  };

  const handleCreateOrUpdateProduct = (formData, isEdit = false) => {
    if (isEdit && editingProduct) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                name: formData.name.trim(),
                category: formData.category.trim() || 'General',
                description: formData.description.trim(),
                imageUrl: formData.imageUrl.trim(),
                targetSellingPrice:
                  formData.targetSellingPrice === ''
                    ? null
                    : Math.max(0, Number(formData.targetSellingPrice))
              }
            : p
        )
      );
      setEditingProduct(null);
      showToast('Product details updated');
    } else {
      const newProduct = {
        id: 'prod-' + Date.now(),
        name: formData.name.trim(),
        category: formData.category.trim() || 'General',
        stage: 'Idea',
        imageUrl: formData.imageUrl.trim(),
        description: formData.description.trim(),
        notes: '',
        targetSellingPrice:
          formData.targetSellingPrice === ''
            ? null
            : Math.max(0, Number(formData.targetSellingPrice)),
        materials: [],
        tasks: [],
        costs: {
          labour: 0,
          packaging: 0,
          overhead: 0
        }
      };
      setProducts((prev) => [newProduct, ...prev]);
      setIsNewProductOpen(false);
      showToast(`Created "${newProduct.name}" in Idea stage`);
      openProductWorkspace(newProduct.id, 'overview');
    }
  };

  const handleDeleteProduct = (product) => {
    setConfirmDialog({
      title: `Delete "${product.name}"?`,
      message:
        'This will permanently remove this product, its task board, and its bill of materials. Shared library materials will remain intact.',
      confirmLabel: 'Delete Product',
      danger: true,
      onConfirm: () => {
        setProducts((prev) => prev.filter((p) => p.id !== product.id));
        if (selectedProductId === product.id) {
          setSelectedProductId(null);
        }
        setConfirmDialog(null);
        showToast(`Deleted "${product.name}"`);
      }
    });
  };

  const updateProductField = (productId, updater) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? updater(p) : p))
    );
  };

  const handleSaveMaterial = (matData) => {
    const cleaned = {
      ...matData,
      name: matData.name.trim(),
      category: matData.category || 'Other',
      unit: matData.unit || 'pcs',
      unitPrice: Math.max(0, Number(matData.unitPrice) || 0),
      description: (matData.description || '').trim(),
      sourceUrl: (matData.sourceUrl || '').trim(),
      notes: (matData.notes || '').trim(),
      suppliers: (matData.suppliers || []).map((s) => ({
        supplierId: s.supplierId,
        quotedPrice: Math.max(0, Number(s.quotedPrice) || 0),
        moq: s.moq ? Math.max(1, parseInt(s.moq, 10) || 1) : null
      }))
    };

    if (materialModalData?.mode === 'edit') {
      setMaterials((prev) =>
        prev.map((m) => (m.id === cleaned.id ? cleaned : m))
      );
      showToast(`Updated "${cleaned.name}" — product costs recalculated`);
    } else {
      const newMat = {
        ...cleaned,
        id: 'mat-' + Date.now()
      };
      setMaterials((prev) => [newMat, ...prev]);
      showToast(`Added "${newMat.name}" to Materials Library`);
    }
    setMaterialModalData(null);
  };

  const handleDeleteMaterial = (material) => {
    const affectedProducts = products.filter((p) =>
      (p.materials || []).some((m) => m.materialId === material.id)
    );

    setConfirmDialog({
      title: `Delete "${material.name}"?`,
      message:
        affectedProducts.length > 0
          ? `This material is currently used in ${affectedProducts.length} product(s). Deleting it will safely detach it from those products and recalculate their unit costs.`
          : 'Are you sure you want to delete this material from the shared library?',
      details:
        affectedProducts.length > 0
          ? `Affected products: ${affectedProducts.map((p) => p.name).join(', ')}`
          : null,
      confirmLabel: 'Delete Material',
      danger: true,
      onConfirm: () => {
        setMaterials((prev) => prev.filter((m) => m.id !== material.id));
        if (affectedProducts.length > 0) {
          setProducts((prev) =>
            prev.map((p) => ({
              ...p,
              materials: (p.materials || []).filter(
                (m) => m.materialId !== material.id
              )
            }))
          );
        }
        setConfirmDialog(null);
        showToast(`Deleted "${material.name}"`);
      }
    });
  };

  const handleSaveSupplier = (supData, materialQuotes = []) => {
    const cleanedSupplier = {
      id: supData.id || 'sup-' + Date.now(),
      name: supData.name.trim(),
      website: (supData.website || '').trim(),
      contact: (supData.contact || '').trim(),
      notes: (supData.notes || '').trim()
    };

    if (supplierModalData?.mode === 'edit') {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === cleanedSupplier.id ? cleanedSupplier : s))
      );
    } else {
      setSuppliers((prev) => [cleanedSupplier, ...prev]);
    }

    // Sync supplier quotes across materials
    const quoteMap = new Map();
    materialQuotes.forEach((q) => {
      if (q.materialId) {
        quoteMap.set(q.materialId, {
          supplierId: cleanedSupplier.id,
          quotedPrice: Math.max(0, Number(q.quotedPrice) || 0),
          moq: q.moq ? Math.max(1, parseInt(q.moq, 10) || 1) : null
        });
      }
    });

    setMaterials((prev) =>
      prev.map((m) => {
        const otherSuppliers = (m.suppliers || []).filter(
          (s) => s.supplierId !== cleanedSupplier.id
        );
        if (quoteMap.has(m.id)) {
          return {
            ...m,
            suppliers: [...otherSuppliers, quoteMap.get(m.id)]
          };
        }
        return {
          ...m,
          suppliers: otherSuppliers
        };
      })
    );

    setSupplierModalData(null);
    showToast(
      supplierModalData?.mode === 'edit'
        ? `Updated supplier "${cleanedSupplier.name}"`
        : `Added supplier "${cleanedSupplier.name}"`
    );
  };

  const handleDeleteSupplier = (supplier) => {
    const linkedMaterials = materials.filter((m) =>
      (m.suppliers || []).some((s) => s.supplierId === supplier.id)
    );

    setConfirmDialog({
      title: `Remove supplier "${supplier.name}"?`,
      message:
        linkedMaterials.length > 0
          ? `This supplier is currently linked to ${linkedMaterials.length} material(s). Removing the supplier will unlink its quotes without deleting any materials.`
          : 'Are you sure you want to delete this supplier record?',
      details:
        linkedMaterials.length > 0
          ? `Linked materials: ${linkedMaterials.map((m) => m.name).join(', ')}`
          : null,
      confirmLabel: 'Delete Supplier',
      danger: true,
      onConfirm: () => {
        setSuppliers((prev) => prev.filter((s) => s.id !== supplier.id));
        setMaterials((prev) =>
          prev.map((m) => ({
            ...m,
            suppliers: (m.suppliers || []).filter(
              (s) => s.supplierId !== supplier.id
            )
          }))
        );
        setConfirmDialog(null);
        showToast(`Deleted supplier "${supplier.name}"`);
      }
    });
  };

  const handleResetSampleData = () => {
    setConfirmDialog({
      title: 'Reset to default sample workspace?',
      message:
        'This will restore the default sample products, materials (including the ₹180 Acrylic Sheet example), and suppliers.',
      confirmLabel: 'Reset Workspace',
      danger: false,
      onConfirm: () => {
        setProducts(INITIAL_PRODUCTS);
        setMaterials(INITIAL_MATERIALS);
        setSuppliers(INITIAL_SUPPLIERS);
        setSelectedProductId(null);
        setConfirmDialog(null);
        showToast('Workspace reset to default sample data');
      }
    });
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !boardSearch.trim() ||
        p.name.toLowerCase().includes(boardSearch.toLowerCase()) ||
        (p.category || '').toLowerCase().includes(boardSearch.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(boardSearch.toLowerCase());
      const matchesStage =
        dashboardView === 'board' ||
        stageFilter === 'ALL' ||
        p.stage === stageFilter;
      return matchesSearch && matchesStage;
    });
  }, [products, boardSearch, stageFilter, dashboardView]);

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-screen h-screen flex flex-col md:flex-row bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans antialiased selection:bg-indigo-500/20 selection:text-indigo-500 overflow-hidden">
        {/* Compact Left Sidebar */}
        <aside className="w-full md:w-60 shrink-0 bg-white dark:bg-zinc-900/90 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800/80 flex flex-col justify-between z-20">
          <div>
            {/* Brand Header */}
            <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800/80">
              <button
                onClick={() => {
                  setSelectedProductId(null);
                  setActiveNav('dashboard');
                }}
                className="flex items-center gap-2.5 text-left group focus:outline-none"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/20 group-hover:bg-indigo-500 transition-colors">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-sm tracking-tight block leading-none">
                    Forma PDLC
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                    Product Lifecycle
                  </span>
                </div>
              </button>

              {/* Mobile quick actions */}
              <div className="flex items-center gap-1.5 md:hidden">
                <button
                  onClick={() => setIsNewProductOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New
                </button>
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Toggle theme"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Prominent + New Product Button (Desktop) */}
            <div className="p-3 hidden md:block">
              <button
                onClick={() => setIsNewProductOpen(true)}
                className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Plus className="w-4 h-4 stroke-[2.2]" />
                <span>New Product</span>
              </button>
            </div>

            {/* 4 Main Navigation Sections */}
            <nav className="px-2 py-1.5 md:py-1 flex md:flex-col gap-1 overflow-x-auto">
              {[
                {
                  id: 'dashboard',
                  label: 'Dashboard',
                  icon: LayoutGrid,
                  count: products.length
                },
                {
                  id: 'products',
                  label: 'Products',
                  icon: Package,
                  count: products.length
                },
                {
                  id: 'materials',
                  label: 'Materials',
                  icon: Layers,
                  count: materials.length
                },
                {
                  id: 'suppliers',
                  label: 'Suppliers',
                  icon: Truck,
                  count: suppliers.length
                }
              ].map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeNav === item.id && !selectedProductId;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedProductId(null);
                      setActiveNav(item.id);
                    }}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-zinc-100 dark:bg-zinc-800/90 text-zinc-900 dark:text-white'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 ${
                          isActive
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-zinc-400 dark:text-zinc-500'
                        }`}
                      />
                      <span>{item.label}</span>
                    </span>
                    <span
                      className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-md tabular-nums ${
                        isActive
                          ? 'bg-white dark:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 shadow-sm'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}
                    >
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Quick Active Products Shortcut List on Desktop */}
            <div className="hidden md:block mt-5 px-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-2 mb-1.5 flex items-center justify-between">
                <span>Quick Jump</span>
              </div>
              <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1">
                {products.map((prod) => {
                  const stageMeta =
                    LIFECYCLE_STAGES.find((s) => s.id === prod.stage) ||
                    LIFECYCLE_STAGES[0];
                  const isSelected = selectedProductId === prod.id;
                  return (
                    <button
                      key={prod.id}
                      onClick={() => openProductWorkspace(prod.id, workspaceTab)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
                        isSelected
                          ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${stageMeta.dotColor}`}
                        />
                        <span className="truncate">{prod.name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar Footer: Currency, Reset, Theme Toggle */}
          <div className="hidden md:flex flex-col gap-2 p-3 border-t border-zinc-200/80 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg">
                {['₹', '$', '€', '£'].map((sym) => (
                  <button
                    key={sym}
                    onClick={() => setCurrency(sym)}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                      currency === sym
                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                    title={`Set currency symbol to ${sym}`}
                  >
                    {sym}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleResetSampleData}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Reset sample data"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                >
                  {theme === 'dark' ? (
                    <Sun className="w-3.5 h-3.5" />
                  ) : (
                    <Moon className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
          {selectedProduct ? (
            <ProductWorkspaceView
              product={selectedProduct}
              workspaceTab={workspaceTab}
              setWorkspaceTab={setWorkspaceTab}
              onBack={() => setSelectedProductId(null)}
              onEditProduct={() => setEditingProduct(selectedProduct)}
              onDeleteProduct={() => handleDeleteProduct(selectedProduct)}
              onUpdateProduct={(updater) =>
                updateProductField(selectedProduct.id, updater)
              }
              onMoveStage={(newStage) =>
                handleMoveProductStage(selectedProduct.id, newStage)
              }
              materials={materials}
              materialsMap={materialsMap}
              suppliersMap={suppliersMap}
              currency={currency}
              draggedTaskId={draggedTaskId}
              setDraggedTaskId={setDraggedTaskId}
              dragOverTaskCol={dragOverTaskCol}
              setDragOverTaskCol={setDragOverTaskCol}
              onOpenNewMaterialModal={() =>
                setMaterialModalData({ mode: 'create', material: null })
              }
              onOpenTaskModal={(mode, task = null, defaultStatus = 'todo') =>
                setTaskModalData({ mode, task, defaultStatus })
              }
              setConfirmDialog={setConfirmDialog}
              showToast={showToast}
            />
          ) : activeNav === 'dashboard' ? (
            <DashboardBoardView
              products={filteredProducts}
              allProductsCount={products.length}
              materialsMap={materialsMap}
              currency={currency}
              dashboardView={dashboardView}
              setDashboardView={setDashboardView}
              boardSearch={boardSearch}
              setBoardSearch={setBoardSearch}
              stageFilter={stageFilter}
              setStageFilter={setStageFilter}
              draggedProductId={draggedProductId}
              setDraggedProductId={setDraggedProductId}
              dragOverStageId={dragOverStageId}
              setDragOverStageId={setDragOverStageId}
              onMoveProductStage={handleMoveProductStage}
              onOpenProduct={(id) => openProductWorkspace(id, 'overview')}
              onOpenNewProduct={() => setIsNewProductOpen(true)}
            />
          ) : activeNav === 'products' ? (
            <ProductsDirectoryView
              products={products}
              materialsMap={materialsMap}
              currency={currency}
              onOpenProduct={(id, tab = 'overview') =>
                openProductWorkspace(id, tab)
              }
              onEditProduct={(prod) => setEditingProduct(prod)}
              onDeleteProduct={(prod) => handleDeleteProduct(prod)}
              onMoveProductStage={handleMoveProductStage}
              onOpenNewProduct={() => setIsNewProductOpen(true)}
            />
          ) : activeNav === 'materials' ? (
            <MaterialsLibraryView
              materials={materials}
              products={products}
              suppliersMap={suppliersMap}
              currency={currency}
              search={materialSearch}
              setSearch={setMaterialSearch}
              categoryFilter={materialCategoryFilter}
              setCategoryFilter={setMaterialCategoryFilter}
              onOpenCreateModal={() =>
                setMaterialModalData({ mode: 'create', material: null })
              }
              onOpenEditModal={(mat) =>
                setMaterialModalData({ mode: 'edit', material: mat })
              }
              onDeleteMaterial={handleDeleteMaterial}
              onQuickPriceUpdate={(matId, newPrice) => {
                setMaterials((prev) =>
                  prev.map((m) =>
                    m.id === matId
                      ? { ...m, unitPrice: Math.max(0, Number(newPrice) || 0) }
                      : m
                  )
                );
                showToast('Material price updated — product costs recalculated');
              }}
              onOpenProduct={(prodId) => openProductWorkspace(prodId, 'materials')}
            />
          ) : (
            <SuppliersManagementView
              suppliers={suppliers}
              materials={materials}
              currency={currency}
              search={supplierSearch}
              setSearch={setSupplierSearch}
              onOpenCreateModal={() =>
                setSupplierModalData({ mode: 'create', supplier: null })
              }
              onOpenEditModal={(sup) =>
                setSupplierModalData({ mode: 'edit', supplier: sup })
              }
              onDeleteSupplier={handleDeleteSupplier}
            />
          )}
        </main>

        {}
        {(isNewProductOpen || editingProduct) && (
          <ProductFormModal
            product={editingProduct}
            currency={currency}
            onClose={() => {
              setIsNewProductOpen(false);
              setEditingProduct(null);
            }}
            onSubmit={(data) =>
              handleCreateOrUpdateProduct(data, Boolean(editingProduct))
            }
          />
        )}

        {materialModalData && (
          <MaterialFormModal
            mode={materialModalData.mode}
            material={materialModalData.material}
            suppliers={suppliers}
            currency={currency}
            onClose={() => setMaterialModalData(null)}
            onSave={handleSaveMaterial}
          />
        )}

        {supplierModalData && (
          <SupplierFormModal
            mode={supplierModalData.mode}
            supplier={supplierModalData.supplier}
            materials={materials}
            currency={currency}
            onClose={() => setSupplierModalData(null)}
            onSave={handleSaveSupplier}
          />
        )}

        {taskModalData && selectedProduct && (
          <TaskFormModal
            mode={taskModalData.mode}
            task={taskModalData.task}
            defaultStatus={taskModalData.defaultStatus}
            onClose={() => setTaskModalData(null)}
            onSave={(taskPayload) => {
              updateProductField(selectedProduct.id, (p) => {
                const existing = p.tasks || [];
                if (taskModalData.mode === 'edit' && taskModalData.task) {
                  return {
                    ...p,
                    tasks: existing.map((t) =>
                      t.id === taskModalData.task.id
                        ? { ...t, ...taskPayload }
                        : t
                    )
                  };
                }
                return {
                  ...p,
                  tasks: [
                    ...existing,
                    {
                      id: 't-' + Date.now(),
                      ...taskPayload
                    }
                  ]
                };
              });
              setTaskModalData(null);
              showToast(
                taskModalData.mode === 'edit' ? 'Task updated' : 'Task added'
              );
            }}
          />
        )}

        {confirmDialog && (
          <ConfirmModal
            dialog={confirmDialog}
            onCancel={() => setConfirmDialog(null)}
          />
        )}

        {toast && (
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium shadow-lg border border-zinc-700/50 dark:border-zinc-300 transition-all">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardBoardView({
  products,
  allProductsCount,
  materialsMap,
  currency,
  dashboardView,
  setDashboardView,
  boardSearch,
  setBoardSearch,
  stageFilter,
  setStageFilter,
  draggedProductId,
  setDraggedProductId,
  dragOverStageId,
  setDragOverStageId,
  onMoveProductStage,
  onOpenProduct,
  onOpenNewProduct
}) {
  // Touch drag fallback support for mobile/tablet devices
  const [touchDraggingId, setTouchDraggingId] = useState(null);

  const handleTouchStartCard = (productId) => {
    setTouchDraggingId(productId);
  };

  const handleTouchMoveBoard = (e) => {
    if (!touchDraggingId) return;
    const touch = e.touches[0];
    if (!touch) return;
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const stageColumn = elem?.closest('[data-stage-column]');
    if (stageColumn) {
      const stageId = stageColumn.getAttribute('data-stage-column');
      if (stageId && stageId !== dragOverStageId) {
        setDragOverStageId(stageId);
      }
    }
  };

  const handleTouchEndBoard = () => {
    if (touchDraggingId && dragOverStageId) {
      onMoveProductStage(touchDraggingId, dragOverStageId);
    }
    setTouchDraggingId(null);
    setDragOverStageId(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 px-4 md:px-6 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-sm font-semibold tracking-tight truncate">
            Product Lifecycle
          </h1>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 hidden sm:inline">
            •
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:inline">
            Drag cards across stages to update lifecycle status
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={boardSearch}
              onChange={(e) => setBoardSearch(e.target.value)}
              placeholder="Filter products..."
              className="w-36 sm:w-48 pl-8 pr-7 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none transition-all"
            />
            {boardSearch && (
              <button
                onClick={() => setBoardSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Board vs List View Toggle */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/90 p-0.5 rounded-lg border border-zinc-200/60 dark:border-zinc-700/50">
            <button
              onClick={() => setDashboardView('board')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                dashboardView === 'board'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Board</span>
            </button>
            <button
              onClick={() => setDashboardView('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                dashboardView === 'list'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Board or List Content */}
      {dashboardView === 'board' ? (
        <div
          className="flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-5"
          onTouchMove={handleTouchMoveBoard}
          onTouchEnd={handleTouchEndBoard}
        >
          <div className="flex h-full gap-3.5 min-w-max">
            {LIFECYCLE_STAGES.map((stage) => {
              const stageProducts = products.filter(
                (p) => p.stage === stage.id
              );
              const isDropTarget = dragOverStageId === stage.id;

              return (
                <div
                  key={stage.id}
                  data-stage-column={stage.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverStageId !== stage.id) {
                      setDragOverStageId(stage.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setDragOverStageId(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const droppedId =
                      e.dataTransfer.getData('text/plain') || draggedProductId;
                    if (droppedId) {
                      onMoveProductStage(droppedId, stage.id);
                    }
                    setDraggedProductId(null);
                    setDragOverStageId(null);
                  }}
                  className={`w-72 shrink-0 flex flex-col rounded-xl border transition-colors ${
                    isDropTarget
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-400 dark:border-indigo-500/70 ring-2 ring-indigo-500/20'
                      : 'bg-zinc-100/70 dark:bg-zinc-900/50 border-zinc-200/80 dark:border-zinc-800/80'
                  }`}
                >
                  {/* Column Stage Header */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-zinc-200/60 dark:border-zinc-800/60">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${stage.dotColor}`}
                      />
                      <h2 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        {stage.label}
                      </h2>
                    </div>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 tabular-nums">
                      {stageProducts.length}
                    </span>
                  </div>

                  {/* Cards Container */}
                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                    {stageProducts.map((product) => (
                      <ProductBoardCard
                        key={product.id}
                        product={product}
                        stageMeta={stage}
                        materialsMap={materialsMap}
                        currency={currency}
                        isDragging={
                          draggedProductId === product.id ||
                          touchDraggingId === product.id
                        }
                        onDragStart={(e) => {
                          setDraggedProductId(product.id);
                          e.dataTransfer.setData('text/plain', product.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          setDraggedProductId(null);
                          setDragOverStageId(null);
                        }}
                        onTouchStart={() => handleTouchStartCard(product.id)}
                        onClick={() => onOpenProduct(product.id)}
                        onQuickStageMove={(newStage) =>
                          onMoveProductStage(product.id, newStage)
                        }
                      />
                    ))}

                    {stageProducts.length === 0 && (
                      <div
                        className={`h-28 rounded-lg border border-dashed flex flex-col items-center justify-center text-center p-3 transition-colors ${
                          isDropTarget
                            ? 'border-indigo-400 bg-indigo-500/5 text-indigo-500'
                            : 'border-zinc-200 dark:border-zinc-800/80 text-zinc-400 dark:text-zinc-600'
                        }`}
                      >
                        <p className="text-[11px] font-medium">
                          {isDropTarget ? 'Drop product here' : 'No products'}
                        </p>
                        <p className="text-[10px] mt-0.5 opacity-80">
                          Drag a card into {stage.label}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Compact List View */
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-6xl mx-auto space-y-4">
            {/* Stage Pill Filter Bar */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setStageFilter('ALL')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
                  stageFilter === 'ALL'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70'
                }`}
              >
                All Stages ({allProductsCount})
              </button>
              {LIFECYCLE_STAGES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStageFilter(s.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 ${
                    stageFilter === s.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dotColor}`} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-50/60 dark:bg-zinc-900/50">
                      <th className="py-2.5 px-4">Product</th>
                      <th className="py-2.5 px-4">Stage</th>
                      <th className="py-2.5 px-4">Tasks</th>
                      <th className="py-2.5 px-4 text-right">Est. Unit Cost</th>
                      <th className="py-2.5 px-4 text-right">Target Price</th>
                      <th className="py-2.5 px-4 text-right">Est. Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 text-xs">
                    {products.map((product) => {
                      const costSummary = calculateProductCostSummary(
                        product,
                        materialsMap
                      );
                      const totalTasks = (product.tasks || []).length;
                      const doneTasks = (product.tasks || []).filter(
                        (t) => t.status === 'done'
                      ).length;

                      return (
                        <tr
                          key={product.id}
                          onClick={() => onOpenProduct(product.id)}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <ProductThumbnail
                                name={product.name}
                                imageUrl={product.imageUrl}
                                size="sm"
                              />
                              <div>
                                <div className="font-medium text-zinc-900 dark:text-zinc-100">
                                  {product.name}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  {product.category || 'General'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td
                            className="py-3 px-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={product.stage}
                              onChange={(e) =>
                                onMoveProductStage(product.id, e.target.value)
                              }
                              className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
                            >
                              {LIFECYCLE_STAGES.map((st) => (
                                <option key={st.id} value={st.id}>
                                  {st.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            {totalTasks > 0 ? (
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-indigo-500 rounded-full"
                                    style={{
                                      width: `${Math.round(
                                        (doneTasks / totalTasks) * 100
                                      )}%`
                                    }}
                                  />
                                </div>
                                <span className="text-[11px] text-zinc-500 tabular-nums">
                                  {doneTasks}/{totalTasks}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-zinc-400">
                                No tasks
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-medium tabular-nums">
                            {formatCurrency(costSummary.totalUnitCost, currency)}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                            {costSummary.targetPrice !== null
                              ? formatCurrency(costSummary.targetPrice, currency)
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums">
                            {costSummary.grossMargin !== null ? (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                                  costSummary.grossMargin >= 35
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : costSummary.grossMargin > 0
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {costSummary.grossMargin}%
                              </span>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {products.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-10 text-center text-zinc-400"
                        >
                          No matching products found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductBoardCard({
  product,
  stageMeta,
  materialsMap,
  currency,
  isDragging,
  onDragStart,
  onDragEnd,
  onTouchStart,
  onClick,
  onQuickStageMove
}) {
  const costSummary = useMemo(
    () => calculateProductCostSummary(product, materialsMap),
    [product, materialsMap]
  );

  const tasks = product.tasks || [];
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'done').length;
  const completionPct =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group relative rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 p-3 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing select-none ${
        isDragging ? 'opacity-45 scale-[0.98] ring-2 ring-indigo-500' : ''
      }`}
    >
      {/* Card Top Row: Thumbnail + Name + Current Stage Badge */}
      <div className="flex items-start gap-2.5">
        <ProductThumbnail
          name={product.name}
          imageUrl={product.imageUrl}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
              {product.name}
            </h3>
            <span
              onTouchStart={(e) => {
                e.stopPropagation();
                onTouchStart();
              }}
              className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 p-0.5 -mr-1 shrink-0"
              title="Drag to move stage"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${stageMeta.badgeBg}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${stageMeta.dotColor}`} />
              {product.stage}
            </span>

            {/* Touch-friendly quick stage selector on hover/mobile */}
            <div onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <select
                aria-label="Change lifecycle stage"
                value={product.stage}
                onChange={(e) => onQuickStageMove(e.target.value)}
                className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded px-1 py-0.5 border border-zinc-200 dark:border-zinc-700 focus:outline-none"
              >
                {LIFECYCLE_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    Move → {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Task Completion Indicator */}
      <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
          <span className="flex items-center gap-1">
            <CheckSquare className="w-3 h-3 text-zinc-400" />
            <span>Tasks</span>
          </span>
          <span className="tabular-nums font-medium">
            {totalTasks > 0 ? `${completedTasks}/${totalTasks}` : '0/0'}
          </span>
        </div>
        <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {/* Cost & Optional Target Selling Price Footer */}
      <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px]">
        <div>
          <span className="text-zinc-400 dark:text-zinc-500 block text-[10px]">
            Est. Unit Cost
          </span>
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
            {formatCurrency(costSummary.totalUnitCost, currency)}
          </span>
        </div>

        {costSummary.targetPrice !== null && (
          <div className="text-right">
            <span className="text-zinc-400 dark:text-zinc-500 block text-[10px]">
              Target Price
            </span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">
              {formatCurrency(costSummary.targetPrice, currency)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductThumbnail({ name, imageUrl, size = 'md' }) {
  const [imgError, setImgError] = useState(false);

  const initials = (name || 'P')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const dimensions =
    size === 'lg'
      ? 'w-12 h-12 rounded-xl text-sm'
      : size === 'sm'
      ? 'w-8 h-8 rounded-lg text-xs'
      : 'w-10 h-10 rounded-lg text-xs';

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={name}
        onError={() => setImgError(true)}
        className={`${dimensions} object-cover shrink-0 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700/70`}
      />
    );
  }

  return (
    <div
      className={`${dimensions} shrink-0 bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-semibold flex items-center justify-center`}
    >
      {initials}
    </div>
  );
}

function ProductWorkspaceView({
  product,
  workspaceTab,
  setWorkspaceTab,
  onBack,
  onEditProduct,
  onDeleteProduct,
  onUpdateProduct,
  onMoveStage,
  materials,
  materialsMap,
  suppliersMap,
  currency,
  draggedTaskId,
  setDraggedTaskId,
  dragOverTaskCol,
  setDragOverTaskCol,
  onOpenNewMaterialModal,
  onOpenTaskModal,
  setConfirmDialog,
  showToast
}) {
  const costSummary = useMemo(
    () => calculateProductCostSummary(product, materialsMap),
    [product, materialsMap]
  );

  const tasks = product.tasks || [];
  const completedTasks = tasks.filter((t) => t.status === 'done').length;
  const stageMeta =
    LIFECYCLE_STAGES.find((s) => s.id === product.stage) || LIFECYCLE_STAGES[0];

  // State for attaching a material inside the Materials tab
  const [selectedMatId, setSelectedMatId] = useState('');
  const [selectedMatQty, setSelectedMatQty] = useState('1');

  // State for quick inline task creation
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [touchDraggingTaskId, setTouchDraggingTaskId] = useState(null);

  const handleTouchMoveTasks = (e) => {
    if (!touchDraggingTaskId) return;
    const touch = e.touches[0];
    if (!touch) return;
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const taskCol = elem?.closest('[data-task-column]');
    if (taskCol) {
      const colId = taskCol.getAttribute('data-task-column');
      if (colId && colId !== dragOverTaskCol) {
        setDragOverTaskCol(colId);
      }
    }
  };

  const handleTouchEndTasks = () => {
    if (touchDraggingTaskId && dragOverTaskCol) {
      handleMoveTaskStatus(touchDraggingTaskId, dragOverTaskCol);
    }
    setTouchDraggingTaskId(null);
    setDragOverTaskCol(null);
  };

  const handleAttachMaterial = (e) => {
    e.preventDefault();
    if (!selectedMatId) return;
    const qty = parseFloat(selectedMatQty);
    if (isNaN(qty) || qty <= 0) {
      showToast('Please enter a valid quantity greater than 0');
      return;
    }

    onUpdateProduct((p) => {
      const existing = p.materials || [];
      const alreadyExists = existing.some(
        (m) => m.materialId === selectedMatId
      );
      if (alreadyExists) {
        return {
          ...p,
          materials: existing.map((m) =>
            m.materialId === selectedMatId
              ? { ...m, quantity: Math.round((Number(m.quantity || 0) + qty) * 1000) / 1000 }
              : m
          )
        };
      }
      return {
        ...p,
        materials: [...existing, { materialId: selectedMatId, quantity: qty }]
      };
    });

    setSelectedMatId('');
    setSelectedMatQty('1');
    showToast('Material attached to product');
  };

  const handleUpdateMaterialQty = (materialId, rawValue) => {
    if (rawValue === '') {
      onUpdateProduct((p) => ({
        ...p,
        materials: (p.materials || []).map((m) =>
          m.materialId === materialId ? { ...m, quantity: '' } : m
        )
      }));
      return;
    }
    const qty = parseFloat(rawValue);
    if (isNaN(qty) || qty < 0) return;
    onUpdateProduct((p) => ({
      ...p,
      materials: (p.materials || []).map((m) =>
        m.materialId === materialId ? { ...m, quantity: rawValue.endsWith('.') ? rawValue : qty } : m
      )
    }));
  };

  const handleRemoveAttachedMaterial = (materialId) => {
    onUpdateProduct((p) => ({
      ...p,
      materials: (p.materials || []).filter((m) => m.materialId !== materialId)
    }));
    showToast('Removed material from product');
  };

  const handleQuickAddTask = (e) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;
    onUpdateProduct((p) => ({
      ...p,
      tasks: [
        ...(p.tasks || []),
        {
          id: 't-' + Date.now(),
          title: quickTaskTitle.trim(),
          description: '',
          status: 'todo',
          dueDate: ''
        }
      ]
    }));
    setQuickTaskTitle('');
    showToast('Task added');
  };

  const handleMoveTaskStatus = (taskId, newStatus) => {
    onUpdateProduct((p) => ({
      ...p,
      tasks: (p.tasks || []).map((t) =>
        t.id === taskId ? { ...t, status: newStatus } : t
      )
    }));
  };

  const handleDeleteTask = (task) => {
    setConfirmDialog({
      title: `Delete task "${task.title}"?`,
      message: 'Are you sure you want to remove this task from the product?',
      confirmLabel: 'Delete Task',
      danger: true,
      onConfirm: () => {
        onUpdateProduct((p) => ({
          ...p,
          tasks: (p.tasks || []).filter((t) => t.id !== task.id)
        }));
        setConfirmDialog(null);
        showToast('Task deleted');
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Workspace Header */}
      <header className="px-4 md:px-6 py-3.5 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Left: Back button + Product Identity + Stage Picker */}
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
              title="Return to Board"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <ProductThumbnail
              name={product.name}
              imageUrl={product.imageUrl}
              size="lg"
            />

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-white truncate">
                  {product.name}
                </h1>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  {product.category || 'General'}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-500">Stage:</span>
                <div className="relative inline-flex items-center">
                  <span
                    className={`w-2 h-2 rounded-full absolute left-2.5 pointer-events-none ${stageMeta.dotColor}`}
                  />
                  <select
                    value={product.stage}
                    onChange={(e) => onMoveStage(e.target.value)}
                    className="pl-6 pr-6 py-1 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 focus:outline-none focus:border-indigo-500"
                  >
                    {LIFECYCLE_STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Summary Metrics + Edit & Delete Controls */}
          <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
            <div className="flex items-center gap-4 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-800 text-xs">
              <div>
                <span className="text-[10px] text-zinc-400 block">
                  Est. Unit Cost
                </span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(costSummary.totalUnitCost, currency)}
                </span>
              </div>
              <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700" />
              <div>
                <span className="text-[10px] text-zinc-400 block">
                  Target Price
                </span>
                <span className="font-semibold tabular-nums">
                  {costSummary.targetPrice !== null
                    ? formatCurrency(costSummary.targetPrice, currency)
                    : 'Not set'}
                </span>
              </div>
              {costSummary.grossMargin !== null && (
                <>
                  <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-700" />
                  <div>
                    <span className="text-[10px] text-zinc-400 block">
                      Gross Margin
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        costSummary.grossMargin >= 30
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : costSummary.grossMargin > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {costSummary.grossMargin}%
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={onEditProduct}
                className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              <button
                onClick={onDeleteProduct}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                title="Delete product"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 4 Workspace Navigation Tabs */}
        <div className="flex items-center gap-1 mt-4 -mb-3.5 border-t border-zinc-100 dark:border-zinc-800/60 pt-2 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview', icon: FileText },
            {
              id: 'materials',
              label: `Materials (${(product.materials || []).length})`,
              icon: Layers
            },
            {
              id: 'tasks',
              label: `Tasks (${completedTasks}/${tasks.length})`,
              icon: CheckSquare
            },
            { id: 'costs', label: 'Costs', icon: DollarSign }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = workspaceTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setWorkspaceTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Workspace Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto">
          {/* TAB 1: OVERVIEW */}
          {workspaceTab === 'overview' && (
            <div className="space-y-6">
              {/* Interactive Lifecycle Pipeline Stepper */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Lifecycle Stage Pipeline
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Click any stage to transition immediately
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
                  {LIFECYCLE_STAGES.map((st, idx) => {
                    const currentIdx = LIFECYCLE_STAGES.findIndex(
                      (s) => s.id === product.stage
                    );
                    const isCurrent = st.id === product.stage;
                    const isPast = idx < currentIdx;
                    return (
                      <button
                        key={st.id}
                        onClick={() => onMoveStage(st.id)}
                        className={`px-2 py-2 rounded-lg text-[11px] font-medium border text-center transition-all truncate ${
                          isCurrent
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : isPast
                            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/20'
                            : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300'
                        }`}
                      >
                        {st.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Columns: Description, Notes, Task Checklist */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Product Description & Notes */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        Product Description
                      </label>
                      <textarea
                        rows={2}
                        value={product.description || ''}
                        onChange={(e) =>
                          onUpdateProduct((p) => ({
                            ...p,
                            description: e.target.value
                          }))
                        }
                        placeholder="Add a clear summary of what this product is and who it is for..."
                        className="w-full px-3 py-2 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        Development Notes & Specifications
                      </label>
                      <textarea
                        rows={4}
                        value={product.notes || ''}
                        onChange={(e) =>
                          onUpdateProduct((p) => ({
                            ...p,
                            notes: e.target.value
                          }))
                        }
                        placeholder="Jot down dimensions, prototype observations, tolerances, or test results..."
                        className="w-full px-3 py-2 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Task Checklist & Progress Indicator */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          Task Checklist
                        </h3>
                        <p className="text-[11px] text-zinc-500">
                          {completedTasks} of {tasks.length} tasks completed
                        </p>
                      </div>
                      <button
                        onClick={() => setWorkspaceTab('tasks')}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        <span>Open Task Board</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-4">
                      <div
                        className="h-full bg-indigo-600 transition-all duration-300"
                        style={{
                          width: `${
                            tasks.length > 0
                              ? Math.round((completedTasks / tasks.length) * 100)
                              : 0
                          }%`
                        }}
                      />
                    </div>

                    {/* Checklist items */}
                    <div className="space-y-1.5 mb-3">
                      {tasks.map((task) => {
                        const isDone = task.status === 'done';
                        return (
                          <div
                            key={task.id}
                            onClick={() =>
                              handleMoveTaskStatus(
                                task.id,
                                isDone ? 'todo' : 'done'
                              )
                            }
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <button
                                type="button"
                                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                                  isDone
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'border-zinc-300 dark:border-zinc-600'
                                }`}
                              >
                                {isDone && <Check className="w-3 h-3" />}
                              </button>
                              <span
                                className={`text-xs truncate ${
                                  isDone
                                    ? 'line-through text-zinc-400 dark:text-zinc-500'
                                    : 'text-zinc-800 dark:text-zinc-200'
                                }`}
                              >
                                {task.title}
                              </span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-700/70 text-zinc-600 dark:text-zinc-300 shrink-0 ml-2">
                              {task.status === 'done'
                                ? 'Done'
                                : task.status === 'in_progress'
                                ? 'In Progress'
                                : 'To Do'}
                            </span>
                          </div>
                        );
                      })}
                      {tasks.length === 0 && (
                        <p className="text-xs text-zinc-400 py-2">
                          No tasks added yet. Add one below.
                        </p>
                      )}
                    </div>

                    {/* Quick Add Task Form */}
                    <form onSubmit={handleQuickAddTask} className="flex gap-2">
                      <input
                        type="text"
                        value={quickTaskTitle}
                        onChange={(e) => setQuickTaskTitle(e.target.value)}
                        placeholder="Add a quick task..."
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                </div>

                {/* Right Column: Pricing & Unit Cost Snapshot */}
                <div className="space-y-6">
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-4">
                    <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      Unit Economics Snapshot
                    </h3>

                    <div>
                      <label className="block text-[11px] font-medium text-zinc-500 mb-1">
                        Target Selling Price ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={
                          product.targetSellingPrice === null ||
                          product.targetSellingPrice === undefined
                            ? ''
                            : product.targetSellingPrice
                        }
                        onChange={(e) =>
                          onUpdateProduct((p) => ({
                            ...p,
                            targetSellingPrice:
                              e.target.value === ''
                                ? null
                                : Math.max(0, Number(e.target.value))
                          }))
                        }
                        placeholder="e.g. 2499"
                        className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500 tabular-nums"
                      />
                    </div>

                    <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
                      <div className="flex justify-between text-zinc-500">
                        <span>Materials ({product.materials?.length || 0})</span>
                        <span className="tabular-nums">
                          {formatCurrency(costSummary.materialsCost, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-500">
                        <span>Labour</span>
                        <span className="tabular-nums">
                          {formatCurrency(costSummary.labour, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-500">
                        <span>Packaging</span>
                        <span className="tabular-nums">
                          {formatCurrency(costSummary.packaging, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-500">
                        <span>Other Overheads</span>
                        <span className="tabular-nums">
                          {formatCurrency(costSummary.overhead, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between font-semibold text-zinc-900 dark:text-white pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <span>Est. Total Unit Cost</span>
                        <span className="tabular-nums">
                          {formatCurrency(costSummary.totalUnitCost, currency)}
                        </span>
                      </div>
                    </div>

                    {costSummary.grossProfit !== null && (
                      <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-800 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-500">
                            Est. Gross Profit / Unit
                          </span>
                          <span
                            className={`font-semibold tabular-nums ${
                              costSummary.grossProfit >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {formatCurrency(costSummary.grossProfit, currency)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-500">Est. Gross Margin</span>
                          <span className="font-semibold tabular-nums">
                            {costSummary.grossMargin !== null
                              ? `${costSummary.grossMargin}%`
                              : '—'}
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setWorkspaceTab('costs')}
                      className="w-full py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>Edit Cost Breakdown</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {}
          {workspaceTab === 'materials' && (
            <div className="space-y-6">
              {/* Attach Material Bar */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      Attach Material from Library
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Select a reusable material and specify the quantity required per finished unit
                    </p>
                  </div>
                  <button
                    onClick={onOpenNewMaterialModal}
                    className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Library Material</span>
                  </button>
                </div>

                <form
                  onSubmit={handleAttachMaterial}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2.5"
                >
                  <div className="sm:col-span-7">
                    <select
                      value={selectedMatId}
                      onChange={(e) => setSelectedMatId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Select material from library...</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {formatCurrency(m.unitPrice, currency)} per{' '}
                          {m.unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        value={selectedMatQty}
                        onChange={(e) => setSelectedMatQty(e.target.value)}
                        placeholder="Qty per unit"
                        className="w-full px-3 py-2 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500 tabular-nums"
                      />
                      {selectedMatId && materialsMap.get(selectedMatId) && (
                        <span className="absolute right-2.5 text-[11px] text-zinc-400 pointer-events-none">
                          {materialsMap.get(selectedMatId).unit}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={!selectedMatId}
                      className="w-full h-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
                    >
                      Attach
                    </button>
                  </div>
                </form>
              </div>

              {/* Bill of Materials Table */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      Product Bill of Materials (Per 1 Finished Unit)
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Costs automatically recalculate when library material prices change
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400 block">
                      Total Material Cost
                    </span>
                    <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                      {formatCurrency(costSummary.materialsCost, currency)}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50">
                        <th className="py-2.5 px-4">Material Reference</th>
                        <th className="py-2.5 px-4">Qty Required / Unit</th>
                        <th className="py-2.5 px-4">Unit</th>
                        <th className="py-2.5 px-4 text-right">Current Unit Cost</th>
                        <th className="py-2.5 px-4 text-right">Calculated Cost</th>
                        <th className="py-2.5 px-4 text-right w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 text-xs">
                      {costSummary.detailedMaterials.map((row) => {
                        if (!row.material) return null;
                        const primarySupplierLink = (
                          row.material.suppliers || []
                        )[0];
                        const supplierObj = primarySupplierLink
                          ? suppliersMap.get(primarySupplierLink.supplierId)
                          : null;

                        return (
                          <tr
                            key={row.materialId}
                            className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30"
                          >
                            <td className="py-3 px-4">
                              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                                {row.material.name}
                              </div>
                              <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                                <span>{row.material.category}</span>
                                {supplierObj && (
                                  <>
                                    <span>•</span>
                                    <span>Supplier: {supplierObj.name}</span>
                                  </>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={row.quantity}
                                onChange={(e) =>
                                  handleUpdateMaterialQty(
                                    row.materialId,
                                    e.target.value
                                  )
                                }
                                onBlur={(e) => {
                                  const num = parseFloat(e.target.value);
                                  if (isNaN(num) || num <= 0) {
                                    handleUpdateMaterialQty(row.materialId, '1');
                                  }
                                }}
                                className="w-24 px-2.5 py-1 rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-medium tabular-nums focus:outline-none focus:border-indigo-500"
                              />
                            </td>
                            <td className="py-3 px-4 text-zinc-500">
                              {row.material.unit}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                              {formatCurrency(row.unitPrice, currency)} /{' '}
                              {row.material.unit}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold tabular-nums">
                              {formatCurrency(row.lineCost, currency)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() =>
                                  handleRemoveAttachedMaterial(row.materialId)
                                }
                                className="p-1 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                title="Remove material from product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {costSummary.detailedMaterials.length === 0 && (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-10 text-center text-zinc-400 text-xs"
                          >
                            No materials attached to this product yet. Use the selector above to attach materials from the shared library.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {costSummary.detailedMaterials.length > 0 && (
                      <tfoot>
                        <tr className="bg-zinc-50/80 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 text-xs font-semibold">
                          <td colSpan={4} className="py-3 px-4 text-right">
                            Total Material Cost per Finished Unit
                          </td>
                          <td className="py-3 px-4 text-right text-indigo-600 dark:text-indigo-400 tabular-nums">
                            {formatCurrency(costSummary.materialsCost, currency)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          {}
          {workspaceTab === 'tasks' && (
            <div
              className="space-y-4"
              onTouchMove={handleTouchMoveTasks}
              onTouchEnd={handleTouchEndTasks}
            >
              {/* Task Header & Straightforward Completion Progress */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      Task Progress
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                      {completedTasks} / {tasks.length} completed
                    </span>
                  </div>
                  <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                      style={{
                        width: `${
                          tasks.length > 0
                            ? Math.round((completedTasks / tasks.length) * 100)
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => onOpenTaskModal('create', null, 'todo')}
                  className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shrink-0 self-start sm:self-center"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Task</span>
                </button>
              </div>

              {/* Three-Column Draggable Task Board */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {TASK_COLUMNS.map((col) => {
                  const colTasks = tasks.filter((t) => t.status === col.id);
                  const isOver = dragOverTaskCol === col.id;

                  return (
                    <div
                      key={col.id}
                      data-task-column={col.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragOverTaskCol !== col.id) {
                          setDragOverTaskCol(col.id);
                        }
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget)) {
                          setDragOverTaskCol(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const tId =
                          e.dataTransfer.getData('text/task-id') ||
                          draggedTaskId;
                        if (tId) {
                          handleMoveTaskStatus(tId, col.id);
                        }
                        setDraggedTaskId(null);
                        setDragOverTaskCol(null);
                      }}
                      className={`rounded-xl border p-3 flex flex-col min-h-[340px] transition-colors ${
                        isOver
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-400 dark:border-indigo-500'
                          : 'bg-zinc-100/70 dark:bg-zinc-900/50 border-zinc-200/80 dark:border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              col.id === 'done'
                                ? 'bg-emerald-500'
                                : col.id === 'in_progress'
                                ? 'bg-amber-500'
                                : 'bg-zinc-400'
                            }`}
                          />
                          <h4 className="text-xs font-semibold">{col.label}</h4>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 tabular-nums">
                            {colTasks.length}
                          </span>
                          <button
                            onClick={() =>
                              onOpenTaskModal('create', null, col.id)
                            }
                            className="p-1 rounded hover:bg-zinc-200/70 dark:hover:bg-zinc-800 text-zinc-500"
                            title={`Add task to ${col.label}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2.5 flex-1">
                        {colTasks.map((task) => {
                          const isDone = task.status === 'done';
                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={(e) => {
                                setDraggedTaskId(task.id);
                                e.dataTransfer.setData('text/task-id', task.id);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => {
                                setDraggedTaskId(null);
                                setDragOverTaskCol(null);
                              }}
                              className={`rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 shadow-sm cursor-grab active:cursor-grabbing transition-all ${
                                draggedTaskId === task.id ||
                                touchDraggingTaskId === task.id
                                  ? 'opacity-40 ring-2 ring-indigo-500'
                                  : ''
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 min-w-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleMoveTaskStatus(
                                        task.id,
                                        isDone ? 'todo' : 'done'
                                      )
                                    }
                                    className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                                      isDone
                                        ? 'bg-emerald-600 border-emerald-600 text-white'
                                        : 'border-zinc-300 dark:border-zinc-600 hover:border-indigo-500'
                                    }`}
                                    title={
                                      isDone
                                        ? 'Mark as To Do'
                                        : 'Mark as Completed'
                                    }
                                  >
                                    {isDone && <Check className="w-3 h-3" />}
                                  </button>
                                  <span
                                    className={`text-xs font-medium leading-snug ${
                                      isDone
                                        ? 'line-through text-zinc-400 dark:text-zinc-500'
                                        : 'text-zinc-900 dark:text-zinc-100'
                                    }`}
                                  >
                                    {task.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <span
                                    onTouchStart={(e) => {
                                      e.stopPropagation();
                                      setTouchDraggingTaskId(task.id);
                                    }}
                                    className="p-1 text-zinc-300 dark:text-zinc-600 hover:text-zinc-400 cursor-grab"
                                    title="Drag task"
                                  >
                                    <GripVertical className="w-3 h-3" />
                                  </span>
                                  <button
                                    onClick={() =>
                                      onOpenTaskModal('edit', task, task.status)
                                    }
                                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                                    title="Edit task"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTask(task)}
                                    className="p-1 rounded text-zinc-400 hover:text-rose-600"
                                    title="Delete task"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {task.description && (
                                <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 pl-6">
                                  {task.description}
                                </p>
                              )}

                              <div className="mt-2.5 pl-6 flex items-center justify-between gap-2">
                                {task.dueDate ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                                    <Calendar className="w-2.5 h-2.5" />
                                    {task.dueDate}
                                  </span>
                                ) : (
                                  <span />
                                )}

                                <select
                                  value={task.status}
                                  onChange={(e) =>
                                    handleMoveTaskStatus(task.id, e.target.value)
                                  }
                                  className="text-[10px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-zinc-600 dark:text-zinc-300"
                                >
                                  {TASK_COLUMNS.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}

                        {colTasks.length === 0 && (
                          <div className="h-24 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-[11px] text-zinc-400">
                            Drop tasks here
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {}
          {workspaceTab === 'costs' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Columns: Cost Inputs Breakdown */}
              <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    Estimated Unit Production Cost Breakdown
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    All figures represent estimated costs to produce 1 finished unit.
                  </p>
                </div>

                {/* 1. Materials (Derived from BOM) */}
                <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/70 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                        1. Materials (from Bill of Materials)
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        Calculated from {(product.materials || []).length}{' '}
                        attached material(s)
                      </span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatCurrency(costSummary.materialsCost, currency)}
                    </span>
                  </div>
                  <button
                    onClick={() => setWorkspaceTab('materials')}
                    className="mt-2 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <span>Manage attached materials</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                {/* 2. Direct Labour */}
                <div className="grid grid-cols-1 sm:grid-cols-12 sm:items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="sm:col-span-7">
                    <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                      2. Direct Labour (per unit)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Assembly, machining, finishing, and QC time per unit
                    </span>
                  </div>
                  <div className="sm:col-span-5">
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs text-zinc-400">
                        {currency}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={product.costs?.labour ?? 0}
                        onChange={(e) =>
                          onUpdateProduct((p) => ({
                            ...p,
                            costs: {
                              ...(p.costs || {}),
                              labour: Math.max(0, Number(e.target.value) || 0)
                            }
                          }))
                        }
                        className="w-full pl-7 pr-3 py-2 rounded-lg text-xs font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-right tabular-nums focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Packaging */}
                <div className="grid grid-cols-1 sm:grid-cols-12 sm:items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="sm:col-span-7">
                    <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                      3. Packaging (per unit)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Outer mailer, inserts, labels, and protective wrap
                    </span>
                  </div>
                  <div className="sm:col-span-5">
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs text-zinc-400">
                        {currency}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={product.costs?.packaging ?? 0}
                        onChange={(e) =>
                          onUpdateProduct((p) => ({
                            ...p,
                            costs: {
                              ...(p.costs || {}),
                              packaging: Math.max(0, Number(e.target.value) || 0)
                            }
                          }))
                        }
                        className="w-full pl-7 pr-3 py-2 rounded-lg text-xs font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-right tabular-nums focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Other Overheads */}
                <div className="grid grid-cols-1 sm:grid-cols-12 sm:items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="sm:col-span-7">
                    <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                      4. Other Overheads (per unit)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Consumables, inbound freight allocation, shop utilities
                    </span>
                  </div>
                  <div className="sm:col-span-5">
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs text-zinc-400">
                        {currency}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={product.costs?.overhead ?? 0}
                        onChange={(e) =>
                          onUpdateProduct((p) => ({
                            ...p,
                            costs: {
                              ...(p.costs || {}),
                              overhead: Math.max(0, Number(e.target.value) || 0)
                            }
                          }))
                        }
                        className="w-full pl-7 pr-3 py-2 rounded-lg text-xs font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-right tabular-nums focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Target Selling Price */}
                <div className="grid grid-cols-1 sm:grid-cols-12 sm:items-center gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="sm:col-span-7">
                    <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                      Target Selling Price (per unit)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Expected retail or direct-to-customer selling price
                    </span>
                  </div>
                  <div className="sm:col-span-5">
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs text-zinc-400">
                        {currency}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={
                          product.costs?.labour === undefined
                            ? ''
                            : product.costs.labour
                        }
                        onChange={(e) =>
                          onUpdateProduct((p) => ({
                            ...p,
                            costs: {
                              ...(p.costs || {}),
                              labour:
                                e.target.value === ''
                                  ? ''
                                  : Math.max(0, Number(e.target.value))
                            }
                          }))
                        }
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            onUpdateProduct((p) => ({
                              ...p,
                              costs: { ...(p.costs || {}), labour: 0 }
                            }));
                          }
                        }}
                        className="w-full pl-7 pr-3 py-2 rounded-lg text-xs font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-right tabular-nums focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Packaging */}
                <div className="grid grid-cols-1 sm:grid-cols-12 sm:items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="sm:col-span-7">
                    <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                      3. Packaging (per unit)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Outer mailer, inserts, labels, and protective wrap
                    </span>
                  </div>
                  <div className="sm:col-span-5">
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs text-zinc-400">
                        {currency}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={
                          product.costs?.packaging === undefined
                            ? ''
                            : product.costs.packaging
                        }
                        onChange={(e) =>
                          onUpdateProduct((p) => ({
                            ...p,
                            costs: {
                              ...(p.costs || {}),
                              packaging:
                                e.target.value === ''
                                  ? ''
                                  : Math.max(0, Number(e.target.value))
                            }
                          }))
                        }
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            onUpdateProduct((p) => ({
                              ...p,
                              costs: { ...(p.costs || {}), packaging: 0 }
                            }));
                          }
                        }}
                        className="w-full pl-7 pr-3 py-2 rounded-lg text-xs font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-right tabular-nums focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Other Overheads */}
                <div className="grid grid-cols-1 sm:grid-cols-12 sm:items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="sm:col-span-7">
                    <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                      4. Other Overheads (per unit)
                    </label>
                    <span className="text-[11px] text-zinc-500">
                      Consumables, inbound freight allocation, shop utilities
                    </span>
                  </div>
                  <div className="sm:col-span-5">
                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-xs text-zinc-400">
                        {currency}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={
                          product.costs?.overhead === undefined
                            ? ''
                            : product.costs.overhead
                        }
                        onChange={(e) =>
                          onUpdateProduct((p) => ({
                            ...p,
                            costs: {
                              ...(p.costs || {}),
                              overhead:
                                e.target.value === ''
                                  ? ''
                                  : Math.max(0, Number(e.target.value))
                            }
                          }))
                        }
                        onBlur={(e) => {
                          if (e.target.value === '') {
                            onUpdateProduct((p) => ({
                              ...p,
                              costs: { ...(p.costs || {}), overhead: 0 }
                            }));
                          }
                        }}
                        className="w-full pl-7 pr-3 py-2 rounded-lg text-xs font-medium bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-right tabular-nums focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 5 Columns: Calculated Summary & Gross Margin Card */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                      Estimated Unit Economics
                    </h3>
                    <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      Estimate
                    </span>
                  </div>

                  {/* Proportional Cost Bar */}
                  {costSummary.totalUnitCost > 0 && (
                    <div className="space-y-1.5">
                      <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-800">
                        <div
                          style={{
                            width: `${
                              (costSummary.materialsCost /
                                costSummary.totalUnitCost) *
                              100
                            }%`
                          }}
                          className="bg-indigo-500"
                          title="Materials"
                        />
                        <div
                          style={{
                            width: `${
                              (costSummary.labour / costSummary.totalUnitCost) *
                              100
                            }%`
                          }}
                          className="bg-sky-500"
                          title="Labour"
                        />
                        <div
                          style={{
                            width: `${
                              (costSummary.packaging /
                                costSummary.totalUnitCost) *
                              100
                            }%`
                          }}
                          className="bg-amber-500"
                          title="Packaging"
                        />
                        <div
                          style={{
                            width: `${
                              (costSummary.overhead /
                                costSummary.totalUnitCost) *
                              100
                            }%`
                          }}
                          className="bg-purple-500"
                          title="Overheads"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3 text-[10px] text-zinc-500">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          Materials
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-sky-500" />
                          Labour
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Packaging
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-purple-500" />
                          Overhead
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">
                        Estimated Unit Production Cost
                      </span>
                      <span className="font-semibold text-sm tabular-nums">
                        {formatCurrency(costSummary.totalUnitCost, currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Target Selling Price</span>
                      <span className="font-semibold text-sm tabular-nums">
                        {costSummary.targetPrice !== null
                          ? formatCurrency(costSummary.targetPrice, currency)
                          : 'Not set'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        Estimated Gross Profit per Unit
                      </span>
                      <span
                        className={`text-base font-bold tabular-nums ${
                          costSummary.grossProfit === null
                            ? 'text-zinc-400'
                            : costSummary.grossProfit >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {costSummary.grossProfit !== null
                          ? formatCurrency(costSummary.grossProfit, currency)
                          : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        Estimated Gross Margin
                      </span>
                      <span
                        className={`text-base font-bold tabular-nums ${
                          costSummary.grossMargin === null
                            ? 'text-zinc-400'
                            : costSummary.grossMargin >= 30
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : costSummary.grossMargin > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {costSummary.grossMargin !== null
                          ? `${costSummary.grossMargin}%`
                          : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 p-3 rounded-lg bg-zinc-100/80 dark:bg-zinc-800/40 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    <Info className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Note:</strong> Gross profit and gross margin are
                      unit-level estimates (Selling Price minus Unit Production
                      Cost). They exclude taxes, marketing, payment processing,
                      and fixed company operating expenses, and should not be
                      interpreted as net profit.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductsDirectoryView({
  products,
  materialsMap,
  currency,
  onOpenProduct,
  onEditProduct,
  onDeleteProduct,
  onMoveProductStage,
  onOpenNewProduct
}) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');

  const filtered = products.filter((p) => {
    const matchText =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(search.toLowerCase());
    const matchStage = stageFilter === 'ALL' || p.stage === stageFilter;
    return matchText && matchStage;
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <header className="h-14 px-4 md:px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-sm font-semibold">Products Directory</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-40 sm:w-56 pl-8 pr-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
            />
          </div>
          <button
            onClick={onOpenNewProduct}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Product</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Stage filter pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setStageFilter('ALL')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium shrink-0 ${
                stageFilter === 'ALL'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              All ({products.length})
            </button>
            {LIFECYCLE_STAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStageFilter(s.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 shrink-0 ${
                  stageFilter === s.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${s.dotColor}`} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((product) => {
              const cost = calculateProductCostSummary(product, materialsMap);
              const stageMeta =
                LIFECYCLE_STAGES.find((s) => s.id === product.stage) ||
                LIFECYCLE_STAGES[0];
              const tasks = product.tasks || [];
              const doneTasks = tasks.filter((t) => t.status === 'done').length;

              return (
                <div
                  key={product.id}
                  onClick={() => onOpenProduct(product.id, 'overview')}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-4 flex flex-col justify-between cursor-pointer shadow-sm hover:shadow-md transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <ProductThumbnail
                          name={product.name}
                          imageUrl={product.imageUrl}
                          size="md"
                        />
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                            {product.name}
                          </h3>
                          <span className="text-[11px] text-zinc-500">
                            {product.category || 'General'}
                          </span>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => onEditProduct(product)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          title="Edit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteProduct(product)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {product.description && (
                      <p className="mt-2.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                        {product.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded border ${stageMeta.badgeBg}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${stageMeta.dotColor}`}
                        />
                        {product.stage}
                      </span>
                      <span className="text-[11px] text-zinc-500 tabular-nums">
                        {doneTasks}/{tasks.length} tasks •{' '}
                        {(product.materials || []).length} materials
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <div>
                        <span className="text-[10px] text-zinc-400 block">
                          Est. Unit Cost
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(cost.totalUnitCost, currency)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-400 block">
                          Target Price
                        </span>
                        <span className="font-semibold tabular-nums">
                          {cost.targetPrice !== null
                            ? formatCurrency(cost.targetPrice, currency)
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaterialsLibraryView({
  materials,
  products,
  suppliersMap,
  currency,
  search,
  setSearch,
  categoryFilter,
  setCategoryFilter,
  onOpenCreateModal,
  onOpenEditModal,
  onDeleteMaterial,
  onQuickPriceUpdate,
  onOpenProduct
}) {
  const categories = useMemo(() => {
    const set = new Set(materials.map((m) => m.category || 'Other'));
    return ['ALL', ...Array.from(set)];
  }, [materials]);

  const filteredMaterials = materials.filter((m) => {
    const matchesSearch =
      !search.trim() ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.category || '').toLowerCase().includes(search.toLowerCase());
    const matchesCat =
      categoryFilter === 'ALL' || m.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <header className="h-14 px-4 md:px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-sm font-semibold">Shared Materials Library</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search materials..."
              className="w-40 sm:w-56 pl-8 pr-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
            />
          </div>
          <button
            onClick={onOpenCreateModal}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Material</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Category Filter Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium shrink-0 transition-colors ${
                  categoryFilter === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70'
                }`}
              >
                {cat === 'ALL' ? `All Categories (${materials.length})` : cat}
              </button>
            ))}
          </div>

          {/* Materials Table */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-50/60 dark:bg-zinc-900/50">
                    <th className="py-2.5 px-4">Material</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Current Unit Price</th>
                    <th className="py-2.5 px-4">Linked Suppliers</th>
                    <th className="py-2.5 px-4">Used In Products</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 text-xs">
                  {filteredMaterials.map((mat) => {
                    const usedInProducts = products.filter((p) =>
                      (p.materials || []).some((m) => m.materialId === mat.id)
                    );

                    return (
                      <tr
                        key={mat.id}
                        className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"
                      >
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                            <span>{mat.name}</span>
                            {mat.sourceUrl && (
                              <a
                                href={mat.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-zinc-400 hover:text-indigo-500"
                                title="Open material source URL"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          {mat.description && (
                            <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">
                              {mat.description}
                            </p>
                          )}
                          {mat.notes && (
                            <p className="text-[10px] text-zinc-400 italic mt-0.5">
                              {mat.notes}
                            </p>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px]">
                            {mat.category}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-400">{currency}</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={mat.unitPrice}
                              onChange={(e) =>
                                onQuickPriceUpdate(mat.id, e.target.value)
                              }
                              className="w-20 px-2 py-1 rounded bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-semibold tabular-nums text-xs focus:outline-none focus:border-indigo-500"
                              title="Edit unit price to dynamically recalculate all products using this material"
                            />
                            <span className="text-zinc-500">/ {mat.unit}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          {(mat.suppliers || []).length > 0 ? (
                            <div className="space-y-1">
                              {mat.suppliers.map((quote) => {
                                const sup = suppliersMap.get(quote.supplierId);
                                if (!sup) return null;
                                return (
                                  <div
                                    key={quote.supplierId}
                                    className="text-[11px] flex items-center gap-1.5"
                                  >
                                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                      {sup.name}
                                    </span>
                                    <span className="text-zinc-400">
                                      (
                                      {formatCurrency(
                                        quote.quotedPrice,
                                        currency
                                      )}
                                      {quote.moq ? `, MOQ ${quote.moq}` : ''})
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-[11px] text-zinc-400">
                              No supplier linked
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {usedInProducts.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {usedInProducts.map((p) => {
                                const usage = (p.materials || []).find(
                                  (m) => m.materialId === mat.id
                                );
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => onOpenProduct(p.id)}
                                    className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                                    title={`Requires ${usage?.quantity} ${mat.unit} per unit`}
                                  >
                                    {p.name} ({usage?.quantity} {mat.unit})
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-[11px] text-zinc-400">
                              Unused
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => onOpenEditModal(mat)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
                              title="Edit material"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteMaterial(mat)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              title="Delete material"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredMaterials.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-10 text-center text-zinc-400"
                      >
                        No materials found. Click "+ New Material" to add one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuppliersManagementView({
  suppliers,
  materials,
  currency,
  search,
  setSearch,
  onOpenCreateModal,
  onOpenEditModal,
  onDeleteSupplier
}) {
  const filteredSuppliers = suppliers.filter(
    (s) =>
      !search.trim() ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.contact || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.notes || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <header className="h-14 px-4 md:px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-sm font-semibold">Suppliers</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search suppliers..."
              className="w-40 sm:w-56 pl-8 pr-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none"
            />
          </div>
          <button
            onClick={onOpenCreateModal}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Supplier</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSuppliers.map((sup) => {
            const suppliedMaterials = materials
              .map((m) => {
                const quote = (m.suppliers || []).find(
                  (q) => q.supplierId === sup.id
                );
                return quote ? { material: m, quote } : null;
              })
              .filter(Boolean);

            return (
              <div
                key={sup.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                        <span>{sup.name}</span>
                        {sup.website && (
                          <a
                            href={sup.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-400 hover:text-indigo-500"
                            title="Visit supplier website"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </h3>
                      {sup.contact && (
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {sup.contact}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onOpenEditModal(sup)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Edit supplier & material quotes"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteSupplier(sup)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        title="Delete supplier"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {sup.notes && (
                    <p className="mt-2.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded-lg">
                      {sup.notes}
                    </p>
                  )}

                  {/* Associated Materials & Quoted Prices */}
                  <div className="mt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Supplied Materials ({suppliedMaterials.length})
                    </div>
                    {suppliedMaterials.length > 0 ? (
                      <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200/70 dark:border-zinc-800 rounded-lg overflow-hidden">
                        {suppliedMaterials.map(({ material, quote }) => (
                          <div
                            key={material.id}
                            className="px-3 py-2 flex items-center justify-between text-xs bg-zinc-50/40 dark:bg-zinc-900"
                          >
                            <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate pr-2">
                              {material.name}
                            </span>
                            <div className="flex items-center gap-2 shrink-0 tabular-nums">
                              <span className="font-semibold text-zinc-900 dark:text-white">
                                {formatCurrency(quote.quotedPrice, currency)} /{' '}
                                {material.unit}
                              </span>
                              {quote.moq && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-500">
                                  MOQ: {quote.moq}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400">
                        No materials associated yet. Click Edit to link materials.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredSuppliers.length === 0 && (
            <div className="col-span-full py-12 text-center text-zinc-400 text-xs">
              No suppliers match your search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductFormModal({ product, currency, onClose, onSubmit }) {
  const [name, setName] = useState(product?.name || '');
  const [description, setDescription] = useState(product?.description || '');
  const [category, setCategory] = useState(product?.category || '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || '');
  const [targetSellingPrice, setTargetSellingPrice] = useState(
    product?.targetSellingPrice !== null &&
      product?.targetSellingPrice !== undefined
      ? String(product.targetSellingPrice)
      : ''
  );
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }
    onSubmit({
      name,
      description,
      category,
      imageUrl,
      targetSellingPrice
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {product ? 'Edit Product' : 'New Product'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Product Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="e.g. Luma Mini Portable Lamp"
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Category <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Lighting"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Target Price ({currency}){' '}
                <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={targetSellingPrice}
                onChange={(e) => setTargetSellingPrice(e.target.value)}
                placeholder="e.g. 1999"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Description <span className="text-zinc-400">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of the product..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Image URL <span className="text-zinc-400">(optional)</span>
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {!product && (
            <p className="text-[11px] text-zinc-400">
              New products start in the <strong>Idea</strong> stage. You can attach materials and tasks inside the product workspace.
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
            >
              {product ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MaterialFormModal({
  mode,
  material,
  suppliers,
  currency,
  onClose,
  onSave
}) {
  const [name, setName] = useState(material?.name || '');
  const [category, setCategory] = useState(
    material?.category || MATERIAL_CATEGORIES[0]
  );
  const [unit, setUnit] = useState(material?.unit || 'sheet');
  const [unitPrice, setUnitPrice] = useState(
    material?.unitPrice !== undefined ? String(material.unitPrice) : ''
  );
  const [description, setDescription] = useState(material?.description || '');
  const [sourceUrl, setSourceUrl] = useState(material?.sourceUrl || '');
  const [notes, setNotes] = useState(material?.notes || '');
  const [supplierLinks, setSupplierLinks] = useState(
    material?.suppliers || []
  );

  // Add supplier quote controls
  const [selSupId, setSelSupId] = useState('');
  const [selQuotePrice, setSelQuotePrice] = useState('');
  const [selMoq, setSelMoq] = useState('');

  const handleAddSupplierQuote = () => {
    if (!selSupId) return;
    const price = Math.max(0, Number(selQuotePrice) || Number(unitPrice) || 0);
    const moq = selMoq ? Math.max(1, parseInt(selMoq, 10) || 1) : null;

    setSupplierLinks((prev) => {
      const filtered = prev.filter((s) => s.supplierId !== selSupId);
      return [...filtered, { supplierId: selSupId, quotedPrice: price, moq }];
    });
    setSelSupId('');
    setSelQuotePrice('');
    setSelMoq('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: material?.id,
      name,
      category,
      unit,
      unitPrice: Math.max(0, Number(unitPrice) || 0),
      description,
      sourceUrl,
      notes,
      suppliers: supplierLinks
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {mode === 'edit' ? 'Edit Material' : 'Add Material to Library'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-5 space-y-4 text-xs overflow-y-auto"
        >
          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Material Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cast Acrylic Sheet (3mm)"
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
              >
                {MATERIAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Unit of Measurement
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
              >
                {MATERIAL_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Unit Price ({currency}) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                step="any"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="180"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dimensions, grade, or finish details..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Source URL <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Notes <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Yield notes or lead time..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Supplier Associations Section */}
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
              Supplier Associations & Quoted Prices
            </label>

            <div className="grid grid-cols-12 gap-2">
              <select
                value={selSupId}
                onChange={(e) => setSelSupId(e.target.value)}
                className="col-span-5 px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                value={selQuotePrice}
                onChange={(e) => setSelQuotePrice(e.target.value)}
                placeholder={`Quote (${currency})`}
                className="col-span-3 px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 tabular-nums"
              />
              <input
                type="number"
                min="1"
                value={selMoq}
                onChange={(e) => setSelMoq(e.target.value)}
                placeholder="MOQ"
                className="col-span-2 px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 tabular-nums"
              />
              <button
                type="button"
                onClick={handleAddSupplierQuote}
                disabled={!selSupId}
                className="col-span-2 py-1.5 px-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium disabled:opacity-40"
              >
                Link
              </button>
            </div>

            {supplierLinks.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {supplierLinks.map((link) => {
                  const sup = suppliers.find((s) => s.id === link.supplierId);
                  return (
                    <div
                      key={link.supplierId}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200/70 dark:border-zinc-700/70"
                    >
                      <div>
                        <span className="font-medium">
                          {sup?.name || 'Supplier'}
                        </span>
                        <span className="text-zinc-500 ml-2 tabular-nums">
                          {formatCurrency(link.quotedPrice, currency)} / {unit}
                          {link.moq ? ` • MOQ: ${link.moq}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setUnitPrice(String(link.quotedPrice))}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Use price
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSupplierLinks((prev) =>
                              prev.filter(
                                (item) => item.supplierId !== link.supplierId
                              )
                            )
                          }
                          className="text-zinc-400 hover:text-rose-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
            >
              {mode === 'edit' ? 'Save Changes' : 'Create Material'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SupplierFormModal({
  mode,
  supplier,
  materials,
  currency,
  onClose,
  onSave
}) {
  const [name, setName] = useState(supplier?.name || '');
  const [website, setWebsite] = useState(supplier?.website || '');
  const [contact, setContact] = useState(supplier?.contact || '');
  const [notes, setNotes] = useState(supplier?.notes || '');

  // Pre-populate material quotes for this supplier
  const [quotes, setQuotes] = useState(() => {
    if (!supplier) return [];
    const list = [];
    materials.forEach((m) => {
      const found = (m.suppliers || []).find(
        (s) => s.supplierId === supplier.id
      );
      if (found) {
        list.push({
          materialId: m.id,
          quotedPrice: found.quotedPrice,
          moq: found.moq || ''
        });
      }
    });
    return list;
  });

  const [selMatId, setSelMatId] = useState('');
  const [selPrice, setSelPrice] = useState('');
  const [selMoq, setSelMoq] = useState('');

  const handleAddMaterialQuote = () => {
    if (!selMatId) return;
    const mat = materials.find((m) => m.id === selMatId);
    const price =
      selPrice !== ''
        ? Math.max(0, Number(selPrice) || 0)
        : mat?.unitPrice || 0;
    setQuotes((prev) => {
      const other = prev.filter((q) => q.materialId !== selMatId);
      return [
        ...other,
        {
          materialId: selMatId,
          quotedPrice: price,
          moq: selMoq ? Math.max(1, parseInt(selMoq, 10) || 1) : ''
        }
      ];
    });
    setSelMatId('');
    setSelPrice('');
    setSelMoq('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(
      {
        id: supplier?.id,
        name,
        website,
        contact,
        notes
      },
      quotes
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {mode === 'edit' ? 'Edit Supplier' : 'New Supplier'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-5 space-y-4 text-xs overflow-y-auto"
        >
          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Supplier Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Polylite Plastics India"
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Website or Source URL
              </label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Contact Details <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email, phone, city..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Notes <span className="text-zinc-400">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Lead times, payment terms, or quality notes..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Associate Materials with this Supplier */}
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300">
              Associated Materials & Quoted Prices
            </label>

            <div className="grid grid-cols-12 gap-2">
              <select
                value={selMatId}
                onChange={(e) => setSelMatId(e.target.value)}
                className="col-span-5 px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
              >
                <option value="">Select material...</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                value={selPrice}
                onChange={(e) => setSelPrice(e.target.value)}
                placeholder={`Quote (${currency})`}
                className="col-span-3 px-2.5 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 tabular-nums"
              />
              <input
                type="number"
                min="1"
                value={selMoq}
                onChange={(e) => setSelMoq(e.target.value)}
                placeholder="MOQ"
                className="col-span-2 px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 tabular-nums"
              />
              <button
                type="button"
                onClick={handleAddMaterialQuote}
                disabled={!selMatId}
                className="col-span-2 py-1.5 px-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium disabled:opacity-40"
              >
                Add
              </button>
            </div>

            {quotes.length > 0 && (
              <div className="space-y-1.5">
                {quotes.map((q) => {
                  const mat = materials.find((m) => m.id === q.materialId);
                  if (!mat) return null;
                  return (
                    <div
                      key={q.materialId}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200/70 dark:border-zinc-700"
                    >
                      <span className="font-medium truncate pr-2">
                        {mat.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-zinc-500 tabular-nums">
                          {formatCurrency(q.quotedPrice, currency)} / {mat.unit}
                          {q.moq ? ` (MOQ ${q.moq})` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setQuotes((prev) =>
                              prev.filter(
                                (item) => item.materialId !== q.materialId
                              )
                            )
                          }
                          className="text-zinc-400 hover:text-rose-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
            >
              {mode === 'edit' ? 'Save Supplier' : 'Create Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskFormModal({ mode, task, defaultStatus, onClose, onSave }) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState(task?.status || defaultStatus || 'todo');
  const [dueDate, setDueDate] = useState(task?.dueDate || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim(),
      status,
      dueDate
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {mode === 'edit' ? 'Edit Task' : 'New Task'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Task Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Validate diffuser snap-fit tolerance"
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Description <span className="text-zinc-400">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional context or acceptance criteria..."
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Column Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
              >
                {TASK_COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Due Date <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
            >
              {mode === 'edit' ? 'Save Task' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({ dialog, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-lg shrink-0 ${
              dialog.danger
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {dialog.title}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {dialog.message}
            </p>
            {dialog.details && (
              <p className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 p-2 rounded-lg mt-2">
                {dialog.details}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={dialog.onConfirm}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium text-white ${
              dialog.danger
                ? 'bg-rose-600 hover:bg-rose-500'
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {dialog.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}