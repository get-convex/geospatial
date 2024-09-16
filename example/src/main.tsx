import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ConvexProvider, ConvexReactClient } from "convex/react";

export const convexAddress: string = import.meta.env.VITE_CONVEX_URL;
const convex = new ConvexReactClient(convexAddress);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>,
);
