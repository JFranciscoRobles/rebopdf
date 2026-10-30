# AI assistants (MCP)

`@rebopdf/mcp` is an MCP server: Claude and other assistants read and change PDF files with it.

```bash
claude mcp add rebopdf -- npx -y @rebopdf/mcp --root ~/Documents
```

`--root` keeps it to those folders; `--font` gives it a font for text in any script. It writes a copy of a PDF unless it is told the file.

## Its tools

- **Files:** `open_pdf`, `save_pdf`, `close_pdf`, `list_pdfs`, `undo`.
- **Reading:** `read_pdf`, `search_pdf`, `recognize_text` (scans).
- **Forms:** `list_fields`, `fill_fields`, `add_field`, `detect_fields`, `remove_field`.
- **Marks:** `highlight_text`, `add_note`, `add_text`, `sign`, `list_marks`, `remove_mark`.
- **Blacking out:** `redact_text`, `redact_area`.
- **Pages:** `rotate_pages`, `delete_pages`, `move_pages`, `merge_pdfs`, `extract_pages`.
- **Signatures and versions:** `sign_digitally`, `check_signatures`, `compare_pdfs`.

Pages go by number from 1 (`"1,3-5"`), places by points from the top left of a page or by a text of it (`near`).
