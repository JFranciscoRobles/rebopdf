# Estado y hoja de ruta

Versión 0.2. Cada paquete escrito y probado: pruebas unitarias en Node, y el editor manejado en Chrome como lo haría una persona, con revisión de accesibilidad en claro y oscuro, en escritorio y en teléfono. Probado con PDF del mundo real: los formularios del IRS, artículos, escaneos, 300 páginas.

## Comprobado

- Las firmas digitales, verificadas por pyHanko como íntegras y válidas, una primera y otra después.
- Lo tachado no está en ningún byte del archivo guardado.
- Una página quitada desaparece del archivo.

## Lo que falta, o no está aún como debe

- Firmas: sin sello de tiempo ni validación a largo plazo (PAdES LTV); no se verifican las autoridades de los certificados. Los cambios después de una firma en un formulario cuyos widgets están separados de sus campos pyHanko los clasifica como otros cambios, no como relleno de formulario.
- El texto en árabe y en las escrituras de la India no se forma como debe.
- Las anotaciones que trae un PDF, salvo resaltados, notas y trazos, se ven pero no se editan.
- Las salas se guardan en memoria; en una sala, las páginas no se giran, mueven ni borran.
- OCR: puede no leerse un título grande junto a una franja oscura de un escaneo.
