import {
  BookOpen, Boxes, FileText, Factory, LayoutDashboard, ScrollText, ShoppingCart, Wallet,
} from "lucide-react";

export type NavItem = {
  key: string;
  label: string;
  icon: typeof Boxes;
  short: string;
  roles: string[];
};

export const NAV: NavItem[] = [
  {
    key: "dashboard", label: "Overview", short: "Overview", icon: LayoutDashboard,
    roles: ["admin", "owner", "production", "salesman", "auditor"],
  },
  {
    key: "orders", label: "Orders", short: "Sales", icon: ShoppingCart,
    roles: ["admin", "salesman", "owner", "auditor"],
  },
  {
    key: "inventory", label: "Inventory", short: "Stock", icon: Boxes,
    roles: ["admin", "production", "owner", "auditor"],
  },
  {
    key: "production", label: "Production", short: "Batches", icon: Factory,
    roles: ["admin", "production", "owner"],
  },
  {
    key: "payables", label: "Payables", short: "Payables", icon: Wallet,
    roles: ["admin", "owner", "auditor"],
  },
  {
    key: "masters", label: "Masters", short: "Masters", icon: BookOpen,
    roles: ["admin"],
  },
  {
    key: "reports", label: "Reports", short: "Reports", icon: FileText,
    roles: ["admin", "owner", "auditor"],
  },
  {
    key: "audit", label: "Audit Log", short: "Audit", icon: ScrollText,
    roles: ["admin", "owner", "auditor"],
  },
];

export function navForRole(role: string): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

export function canAccess(role: string, page: string): boolean {
  const item = NAV.find((entry) => entry.key === page);
  return Boolean(item?.roles.includes(role));
}
