import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Suspense } from "react";
import InteractionEffects from "./components/InteractionEffects";
import { CalendarPage, PurchaseOrders, Rotation, Consumption, Dashboard, Items, Reports, Sessions, Transactions } from "./lib/pages";

function Router() {
  return (
    <DashboardLayout>
      <Suspense fallback={<div role="status" aria-label="Loading page" className="animate-pulse space-y-4"><div className="h-8 w-48 rounded bg-muted" /><div className="h-64 rounded-xl bg-muted" /></div>}>
      <Switch>
        <Route path={"/"} component={Dashboard} />
        <Route path={"/items"} component={Items} />
        <Route path={"/transactions"} component={Transactions} />
        <Route path={"/consumption"} component={Consumption} />
        <Route path={"/calendar"} component={CalendarPage} />
        <Route path={"/purchase-orders"} component={PurchaseOrders} />
        <Route path={"/rotation"} component={Rotation} />
        <Route path={"/sessions"} component={Sessions} />
        <Route path={"/reports"} component={Reports} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
      </Suspense>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" richColors />
          <InteractionEffects />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
