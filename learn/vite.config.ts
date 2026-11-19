import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tutorPlugin } from "./tutor/vite-plugin.mjs"

export default defineConfig({
  // relative base: the built page can be served from a subpath over HTTP;
  // opening index.html via file:// is not supported because ES modules/CSS hit CORS.
  base: "./",
  plugins: [react(), tailwindcss(), tutorPlugin()],
})
