import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/app.css";
import "./styles/buttons.css";
import "./styles/layout.css";
import "./styles/shade.css";

createRoot(document.getElementById("root")!).render(<App />);
