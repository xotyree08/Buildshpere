import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
    // The layout suites generate hundreds of complete houses each — three
    // programmes by ten styles by three frontages, every one of them packed at
    // seven storey widths and tiled sixteen ways per zone. That is real work,
    // and individual tests run around three seconds against vitest's five
    // second default. On an idle machine they pass; under the parallelism of a
    // loaded CI runner they were close enough to the edge that three different
    // measurements of this same commit reported three different results.
    //
    // A test that fails only when the machine is busy teaches people to re-run
    // CI instead of reading it.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
