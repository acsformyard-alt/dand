import { App } from "./App.js";

const mountApp = () => {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root container not found");
  }
  const app = new App();
  app.mount(container);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountApp);
} else {
  mountApp();
}
