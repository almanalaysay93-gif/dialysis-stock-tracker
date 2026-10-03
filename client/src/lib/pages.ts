import { lazy } from "react";

const loaders = {
  "/": () => import("@/pages/Dashboard"),
  "/items": () => import("@/pages/Items"),
  "/transactions": () => import("@/pages/Transactions"),
  "/consumption": () => import("@/pages/Consumption"),
  "/calendar": () => import("@/pages/Calendar"),
  "/purchase-orders": () => import("@/pages/PurchaseOrders"),
  "/rotation": () => import("@/pages/Rotation"),
  "/sessions": () => import("@/pages/Sessions"),
  "/reports": () => import("@/pages/Reports"),
};

export function preloadPage(path: string) {
  const load = loaders[path as keyof typeof loaders];
  if (load) void load().catch(() => { /* Navigation retries failed preloads. */ });
}

export const Dashboard = lazy(loaders["/"]);
export const Items = lazy(loaders["/items"]);
export const Transactions = lazy(loaders["/transactions"]);
export const Consumption = lazy(loaders["/consumption"]);
export const CalendarPage = lazy(loaders["/calendar"]);
export const PurchaseOrders = lazy(loaders["/purchase-orders"]);
export const Rotation = lazy(loaders["/rotation"]);
export const Sessions = lazy(loaders["/sessions"]);
export const Reports = lazy(loaders["/reports"]);
