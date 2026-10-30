# Styling and themes

The viewer and the editor follow the system's light or dark, or the one given (`theme: 'light' | 'dark'`, `setTheme`). Every class is under `rp-`, so they do not meet the styles of your page or of the other apps of the suite.

Their colours and their font are custom properties of `.rp-root`, for your CSS to change:

```css
.rp-root {
  --rp-accent: #1c5fd6;
  --rp-accent-hover: #164bb0;
  --rp-pressed: #e7f0ff;
  --rp-pressed-text: #1c5fd6;
  --rp-focus: #1c5fd6;
  --rp-font: 'Inter', system-ui, sans-serif;
}
.rp-root[data-theme='dark'] {
  --rp-accent: #74a7ff;
}
```

The pages themselves are drawn as the PDF has them, in light and in dark.
