// What the pages cannot do by themselves: read a PDF from the disk and write
// it back, open a window for another PDF, and hear of the PDFs the system
// asks the application to open (dropped on its icon, a double click in the
// Finder or the Explorer).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// The extensions of the files the application opens.
const EXTENSIONS: [&str; 1] = ["pdf"];

/// The files the system asked to open that no window has taken yet, and the one each new window was opened for.
#[derive(Default)]
struct Opened {
    pending: Vec<String>,
    by_window: HashMap<String, String>,
    /// The windows still loading that will take what is pending once their page asks.
    loading: HashSet<String>,
    windows: u32,
}

/// The bytes of a file.
#[tauri::command]
fn read_document(path: String) -> Result<Response, String> {
    std::fs::read(&path).map(Response::new).map_err(|e| e.to_string())
}

/// Writes the body of the request to the file its `path` header names. The
/// bytes go to a file beside it first: a failure halfway leaves the old one.
#[tauri::command]
fn write_document(request: Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("path")
        .and_then(|value| value.to_str().ok())
        .map(percent_decode)
        .ok_or("no path to write to")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("the document did not come as bytes".into());
    };
    let path = PathBuf::from(path);
    let name = path.file_name().ok_or("no file name")?.to_string_lossy();
    let temporary = path.with_file_name(format!(".{name}.saving"));
    std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&temporary, &path).map_err(|e| {
        let _ = std::fs::remove_file(&temporary);
        e.to_string()
    })
}

/// The document this window was opened for, or those the system asked to open meanwhile.
#[tauri::command]
fn take_opened(window: WebviewWindow, opened: State<'_, Mutex<Opened>>) -> Vec<String> {
    let mut opened = opened.lock().unwrap();
    opened.loading.remove(window.label());
    if let Some(path) = opened.by_window.remove(window.label()) {
        return vec![path];
    }
    std::mem::take(&mut opened.pending)
}

/// Closes every window as if the person closed it: each one with changes asks first, and may stay open.
#[tauri::command]
fn quit(app: AppHandle) {
    for window in app.webview_windows().values() {
        let _ = window.close();
    }
}

/// A new window, for the PDF at `path`, or for none yet.
#[tauri::command]
fn new_window(app: AppHandle, path: Option<String>) -> Result<(), String> {
    open_window(&app, path).map_err(|e| e.to_string())
}

fn open_window(app: &AppHandle, path: Option<String>) -> tauri::Result<()> {
    let opened = app.state::<Mutex<Opened>>();
    let label = {
        let mut opened = opened.lock().unwrap();
        opened.windows += 1;
        let label = format!("document-{}", opened.windows);
        match path {
            Some(path) => {
                opened.by_window.insert(label.clone(), path);
            }
            None => {
                opened.loading.insert(label.clone());
            }
        }
        label
    };
    // A little below and to the right of the one in front, as documents open.
    let offset = app.webview_windows().len() as f64 * 24.0;
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("ReboPDF")
        .inner_size(1360.0, 860.0)
        .min_inner_size(900.0, 560.0)
        .position(80.0 + offset, 60.0 + offset)
        .build()?;
    Ok(())
}

/// Documents the system asked to open: they wait until a window takes them,
/// and the window in front is told they are there.
fn documents_opened(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    {
        let state = app.state::<Mutex<Opened>>();
        let mut opened = state.lock().unwrap();
        opened.pending.extend(paths);
        // A window still loading takes them when its page is ready: the first one, when the
        // system opens the application for a document, is not even listed yet.
        if !opened.loading.is_empty() {
            return;
        }
    }
    let windows = app.webview_windows();
    let front = windows
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
        .or_else(|| windows.values().next());
    match front {
        Some(window) => {
            let _ = app.emit_to(window.label(), "documents-opened", ());
        }
        None => {
            let _ = open_window(app, None);
        }
    }
}

/// The documents among the arguments the application was started with, as Windows and Linux open a file with it.
fn documents_in_args() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|arg| is_document(Path::new(arg)))
        .collect()
}

/// Whether a path is a file the application opens.
fn is_document(path: &Path) -> bool {
    path.is_file() && path.extension().is_some_and(|ext| EXTENSIONS.iter().any(|known| ext.eq_ignore_ascii_case(known)))
}

/// `%XX` back to the byte it stands for: the header carries the path that way, as it may not be ASCII.
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(byte) = hex.and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(Opened { pending: documents_in_args(), ..Default::default() }))
        .invoke_handler(tauri::generate_handler![read_document, write_document, take_opened, new_window, quit])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let opened = window.state::<Mutex<Opened>>();
                opened.lock().unwrap().loading.remove(window.label());
            }
        })
        .setup(|app| {
            // On a Mac the document the application was started for may have opened one already.
            let opened = app.state::<Mutex<Opened>>().lock().unwrap().windows;
            if opened == 0 {
                open_window(app.handle(), None)?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the application could not start");

    app.run(|_app, _event| {
        // On a Mac a document comes as an event, also the one the application was started for.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            documents_opened(_app, paths);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_path_from_its_header() {
        assert_eq!(percent_decode("%2FUsers%2Fana%2FContrato%20firmado.pdf"), "/Users/ana/Contrato firmado.pdf");
        assert_eq!(percent_decode("Espa%C3%B1a.pdf"), "España.pdf");
        assert_eq!(percent_decode("100%"), "100%");
    }

    #[test]
    fn opens_pdfs_and_nothing_else() {
        let dir = std::env::temp_dir().join(format!("rebopdf-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let pdf = dir.join("Contract.PDF");
        let text = dir.join("notes.txt");
        std::fs::write(&pdf, b"%PDF-1.7").unwrap();
        std::fs::write(&text, b"hello").unwrap();
        assert!(is_document(&pdf));
        assert!(!is_document(&text));
        assert!(!is_document(&dir));
        assert!(!is_document(&dir.join("missing.pdf")));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
