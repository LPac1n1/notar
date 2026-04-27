import AppRoutes from "./routes/AppRoutes";
import GlobalAsyncFeedback from "./components/ui/GlobalAsyncFeedback";

export default function App() {
  return (
    <>
      <AppRoutes />
      <GlobalAsyncFeedback />
    </>
  );
}
