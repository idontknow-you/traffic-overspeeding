import ViolationsDashboard from "./components/ViolationsDashboard";
import { AppealsList } from "./components/AppealPanel";

export default function App() {
  return (
    <>
      <ViolationsDashboard />
      <div className="max-w-5xl mx-auto px-6 pb-6">
        <AppealsList />
      </div>
    </>
  );
}