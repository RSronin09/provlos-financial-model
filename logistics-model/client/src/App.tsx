import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Report from "./pages/Report";
import Settings from "./pages/Settings";
import Monthly from "./pages/Monthly";
import NotFound from "./pages/not-found";

function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/monthly" component={Monthly} />
        <Route path="/report" component={Report} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <AppRouter />
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
