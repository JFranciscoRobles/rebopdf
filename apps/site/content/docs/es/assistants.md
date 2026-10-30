# Asistentes de IA (MCP)

`@rebopdf/mcp` es un servidor MCP: Claude y otros asistentes leen y cambian archivos PDF con él.

```bash
claude mcp add rebopdf -- npx -y @rebopdf/mcp --root ~/Documentos
```

`--root` lo limita a esas carpetas; `--font` le da una fuente para texto en cualquier alfabeto. Escribe una copia del PDF salvo que se le indique el archivo.

## Sus herramientas

- **Archivos:** `open_pdf`, `save_pdf`, `close_pdf`, `list_pdfs`, `undo`.
- **Lectura:** `read_pdf`, `search_pdf`, `recognize_text` (escaneos).
- **Formularios:** `list_fields`, `fill_fields`, `add_field`, `detect_fields`, `remove_field`.
- **Marcas:** `highlight_text`, `add_note`, `add_text`, `sign`, `list_marks`, `remove_mark`.
- **Tachado:** `redact_text`, `redact_area`.
- **Páginas:** `rotate_pages`, `delete_pages`, `move_pages`, `merge_pdfs`, `extract_pages`.
- **Firmas y versiones:** `sign_digitally`, `check_signatures`, `compare_pdfs`.

Las páginas van por número desde 1 (`"1,3-5"`); las posiciones, en puntos desde la esquina superior izquierda de la página o por un texto de ella (`near`).
