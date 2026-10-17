"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./Icon";

const TABS: { href: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: "/", label: "Início", icon: "home", match: (p) => p === "/" || p === "/definicoes" },
  { href: "/encomendas", label: "Encomendas", icon: "bag", match: (p) => p === "/encomendas" || p === "/encomendas/chegada" },
  { href: "/clientes", label: "Clientes", icon: "users", match: (p) => p.startsWith("/clientes") },
  { href: "/relatorios", label: "Relatórios", icon: "chart", match: (p) => p.startsWith("/relatorios") },
];

const SHOW_ON = ["/", "/encomendas", "/clientes", "/relatorios", "/definicoes"];

export default function TabBar() {
  const pathname = usePathname() ?? "/";
  const visible = SHOW_ON.includes(pathname) || pathname.startsWith("/relatorios") || /^\/clientes\/[^/]+$/.test(pathname);
  if (!visible) return null;
  return (
    <nav className="tabbar" aria-label="Navegação principal">
      <div className="tabbar-inner">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link key={tab.href} href={tab.href} className="tab" aria-current={active ? "page" : undefined}>
              <Icon name={tab.icon} size={24} stroke={active ? 2.4 : 1.8} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
