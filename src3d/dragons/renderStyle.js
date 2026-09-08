// Global switch for how dragons are shaded and tessellated.
//
// `smooth: false` reproduces the original Batch 2 look exactly — flat shading
// and low segment counts on every part. `smooth: true` renders the organic
// parts as smooth surfaces at higher tessellation, while types whose facets
// ARE the material (ice, diamond, glass, origami paper) stay faceted either
// way — see isSmooth() in DragonFactory.js.
//
// Mutating this only affects dragons built afterwards; existing ones keep the
// geometry and materials they were created with. The gallery rebuilds its grid
// when toggling so you can compare the two side by side.
export const RENDER_STYLE = {
  smooth: true,
};

export function setRenderStyle(patch) {
  Object.assign(RENDER_STYLE, patch);
}
