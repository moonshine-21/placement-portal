import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        landing: "frontend/index.html",
        login: "frontend/login.html",
        dashboard: "frontend/dashboard.html",
      },
    },
  },
});
