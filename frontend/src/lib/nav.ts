import {
  BarChart3, BookOpen, Boxes, CreditCard, Factory, FileText,
  LayoutDashboard, Receipt, ScrollText, ShoppingBag, ShoppingCart, Users,
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
    key: "dashboard", label: "Dashboard", short: "Dashboard", icon: LayoutDashboard,
    roles: ["admin", "owner", "production", "salesman", "auditor"],
  },
  {
    key: "inventory", label: "Inventory", short: "Stock", icon: Boxes,
    roles: ["admin", "production", "owner", "auditor"],
  },
  {
    key: "production", label: "Production", short: "Production", icon: Factory,
    roles: ["admin", "production", "owner"],
  },
  {
    key: "purchases", label: "Purchases", short: "Purchases", icon: ShoppingBag,
    roles: ["admin", "owner", "production", "auditor"],
  },
  {
    key: "orders", label: "Sales Orders", short: "Orders", icon: ShoppingCart,
    roles: ["admin", "salesman", "owner", "auditor"],
  },
  {
    key: "invoices", label: "Invoices", short: "Invoices", icon: Receipt,
    roles: ["admin", "salesman", "owner", "auditor"],
  },
  {
    key: "payments", label: "Payments", short: "Payments", icon: CreditCard,
    roles: ["admin", "salesman", "owner", "auditor"],
  },
  {
    key: "reports", label: "Reports", short: "Reports", icon: BarChart3,
    roles: ["admin", "owner", "auditor"],
  },
  {
    key: "users", label: "User Management", short: "Users", icon: Users,
    roles: ["admin"],
  },
  {
    key: "masters", label: "Masters", short: "Masters", icon: BookOpen,
    roles: ["admin"],
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
