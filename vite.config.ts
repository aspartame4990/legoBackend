import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
    root: ".",
    publicDir: "public",
    server: {
        host: true,
        port: 5173,
        allowedHosts: [
            "dwayne-nondeadly-nonfeasibly.ngrok-free.dev",
            ".ngrok-free.app",
            ".ngrok-free.dev"
        ],
        proxy: {
            "/api": "http://localhost:8000"
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
