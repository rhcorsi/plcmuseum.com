// Vite (and so vitest) imports any file as a string with the ?raw suffix; this tells TypeScript about it.
declare module '*?raw' {
  const content: string;
  export default content;
}
