# Cómo funciona

Un `Pdf` son los archivos de los que se abrió, sus páginas en su orden, sus campos con lo que contienen, y lo que se le puso (marcas). Cada cambio crea un `Pdf` nuevo; los archivos se comparten entre ellos, así que el historial del editor es una lista de `Pdf`.

Nada se escribe en los archivos hasta guardar el PDF. Entonces pdf-lib escribe sobre el primer archivo: sus páginas en su orden (las de otros archivos copiadas dentro), su formulario relleno, cada marca escrita (resaltados, notas y trazos como anotaciones con su apariencia dibujada; texto y firmas dentro de la página), las páginas con recuadros dibujadas como imágenes, y fuera lo que ya nada alcanza. Un PDF firmado se escribe añadiendo a su archivo.

PDF.js dibuja las páginas (desde bytes sin las anotaciones tomadas como marcas, que dibuja el visor) y lee su texto, sus enlaces y su índice. El visor pone sobre cada página su texto para seleccionar, sus enlaces, las marcas, los campos como controles de la página, y lo encontrado.
