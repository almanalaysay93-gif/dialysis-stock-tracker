import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CalendarPage from "./pages/Calendar";
import PurchaseOrders from "./pages/PurchaseOrders";
import Consumption from "./pages/Consumption";
import Dashboard from "./pages/Dashboard";
import Items from "./pages/Items";
import Reports from "./pages/Reports";
import Sessions from "./pages/Sessions";
import Transactions from "./pages/Transactions";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Dashboard} />
        <Route path={"/items"} component={Items} />
        <Route path={"/transactions"} component={Transactions} />
        <Route path={"/consumption"} component={Consumption} />
        <Route path={"/calendar"} component={CalendarPage} />
        <Route path={"/purchase-orders"} component={PurchaseOrders} />
        <Route path={"/sessions"} component={Sessions} />
        <Route path={"/reports"} component={Reports} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
