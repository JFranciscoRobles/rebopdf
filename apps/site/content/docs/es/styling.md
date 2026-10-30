# Estilos y temas

El visor y el editor siguen el claro u oscuro del sistema, o el que se les dé (`theme: 'light' | 'dark'`, `setTheme`). Todas sus clases van bajo `rp-`, así que no chocan con los estilos de tu página ni con los de las otras apps de la suite.

Sus colores y su fuente son propiedades personalizadas de `.rp-root`, para que tu CSS las cambie:

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

Las páginas se dibujan tal como el PDF las tiene, en claro y en oscuro.
