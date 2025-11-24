import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
    root: ".",
    publicDir: "public",
    server: {
        host: true,
        port: 5173,
        proxy: {
            "/api": "http://localhost:8080"
        }
    },
    build: {
        outDir: "static",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: resolve(__dirname, "index.html"),
            }
        }
    }
});
