/**
 * The brand palette as JS values — the mirror of the @theme block in
 * src/app/globals.css (which is the single source of truth for the hexes).
 *
 * Import these wherever a color must be a *string*, not a class: chart fills,
 * SweetAlert button colors, leaflet path options, print stylesheets, canvas.
 * In markup, use the Tailwind tokens instead (`bg-ember`, `text-moss`), so a
 * rebrand stays an edit in globals.css plus this file — never a hunt through
 * components.
 */
export const brand = {
  // Deep green-black chrome: header, hero, footer, primary buttons
  bark: "#26352f",
  bark900: "#1e2a25",
  bark950: "#1a2420",
  barkHover: "#1c2924",
  barkRaised: "#31483e",

  // Muted green-gray body text on sand
  moss: "#617068",
  mossDark: "#3d5148",
  mossMid: "#415047",
  mossSoft: "#4a5851",
  mossDim: "#4a564f",
  mossHover: "#3a4a43",
  mossFaint: "#8b9790",
  mossFaint2: "#8a948d",
  warmgray: "#8a8378",
  graydim: "#a1a1a1",
  graymuted: "#9ca3af",
  grayui: "#6b7280",

  // Terracotta: buttons, badges, active accents
  ember: "#b36b3c",
  emberDark: "#96552e",
  emberDeep: "#96552c",
  emberShade: "#a35622",
  emberSoft: "#8c572b",
  emberRust: "#8c4b18",

  // Warm golds & tans
  gold: "#f1c89e",
  goldSoft: "#e0c9a8",
  goldPale: "#f7e3d2",
  goldBright: "#f5d0a9",
  goldBlush: "#f0e6dc",
  goldDeep: "#9a741c",
  goldShadow: "#7c5d16",
  goldOlive: "#8a7a5c",
  goldBrown: "#5c3a1c",
  goldSand: "#e2d5b6",

  // Sand: the paper of the app, its cards and hairlines
  sand: "#f7f4ee",
  sandLine: "#dfdbd1",
  sandMute: "#c9c5bb",
  sandDeep: "#e5dfd2",
  sandEdge: "#cfc9bd",
  sandHoverline: "#b9b3a6",
  sandTint: "#eae6de",
  sandSoft: "#eeeae2",
  sandWarm: "#e8e2d5",
  sandShade: "#eae4d8",
  sandWash: "#e9e5dd",
  sandSheen: "#e6e2d8",
  sandLight: "#f2efe8",
  sandPaper: "#f0ece3",
  sandGrain: "#ede8dc",
  sandCard: "#faf9f5",
  sandPlate: "#fcfbf9",
  sandVellum: "#faf9f6",
  sandSilk: "#faf8f3",
  sandLinen: "#faf7f2",
  sandVeil: "#faf7f0",
  sandMist: "#fdfbf7",
  sandCream: "#fdf8ef",
  sandSheer: "#fdf3eb",
  sandAiry: "#fbf6f0",
  sandGlow: "#fdf6ec",
  sandBright: "#fff7ec",
  sandHover: "#dfd9cb",
  sandHaze: "#f0ede6",
  sandFilm: "#f4f1ea",

  // Sage greens: success, positive amounts, gentle accents
  sage: "#5f8067",
  sageDeep: "#4d6d55",
  sageStrong: "#3d7146",
  sageShade: "#335e3a",
  sageBright: "#2d5d39",
  sageDeepest: "#2e5735",
  sageDeep2: "#305a38",
  sageMid: "#4a7256",
  sageSoft: "#4e6b55",
  sageRich: "#3d6b4f",
  sageGray: "#4a5b52",
  sageSlate: "#6d7a71",
  sageLime: "#7a8c56",
  sageWash: "#d5dfd7",
  sageMist: "#c9d5ca",
  sageLine: "#c1d0c4",
  sageMild: "#c4d6c8",
  sageLight: "#88b393",
  sagePale: "#a9bcae",
  sageBreathe: "#dce6da",
  sageAir: "#c1d7c9",
  sageTint: "#dce9df",
  sageFog: "#8a968d",
  leaf: "#d0ddca",
  leafWash: "#dce9dd",

  // Cool near-white greens
  mist: "#f4f7f4",
  mistTint: "#f4f7f2",
  mistSoft: "#e8f3ec",
  mistVeil: "#f0f7f2",
  mistSelect: "#eef2ed",

  // Destructive reds
  brick: "#8c2e2e",
  alert: "#b91c1c",
  alertDeep: "#991b1b",
  alertSoft: "#a05252",
  alertShade: "#8c3a3a",
  alertWash: "#fdf2f2",
  alertPale: "#fde8e8",
  alertFilm: "#f3e8e8",
  alertVeil: "#efe3e3",
} as const;

/** Categorical series colors for composition and pie charts. */
export const compositionColors = [
  brand.bark,
  brand.sage,
  brand.ember,
  brand.goldOlive,
  brand.sageDeep,
  brand.emberDeep,
] as const;

/** Campaign breakdown series colors. */
export const pieColors = [
  brand.sageBright,
  brand.sage,
  brand.goldDeep,
  brand.ember,
  brand.sageDeep,
] as const;

/** Ministry/campaign slice colors (up to eight series). */
export const ministryColors = [
  brand.sageBright,
  brand.sage,
  brand.goldDeep,
  brand.ember,
  brand.goldOlive,
  brand.sageDeep,
  brand.emberDeep,
  brand.moss,
] as const;
