import "@kummie/brand/tokens.css";
import "@kummie/brand/fonts.css";
import "@kummie/brand/brand.css";
import "./admin.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
