import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  // relative base: the built page also works when opened from the filesystem
  base: "./",
  plugins: [react(), tailwindcss()],
})
