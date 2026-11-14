import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径产出：可直接放在 GitHub Pages 子路径或任意静态目录下
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
