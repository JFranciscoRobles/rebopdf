// The viewer and the editor as React components. They render a box and are
// mounted in it in the browser, after the first render: on the server they
// are that box alone. The Pdf given is shown, and shown again when another is
// given; the callbacks follow their props.

import { type Pdf, openPdf } from '@rebopdf/core';
import { type Editor, type EditorOptions, mountEditor } from '@rebopdf/editor';
import { mountViewer, type Viewer, type ViewerOptions } from '@rebopdf/viewer';
import { type CSSProperties, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

interface Box {
  className?: string;
  /** The element takes the height of what it is in: something must give it one. */
  style?: CSSProperties;
}

export interface PdfViewerProps extends Omit<ViewerOptions, 'decorateThumb'>, Box {}

/** A PDF shown: its pages, thumbnails, zoom and search; its form filled when `onChange` is given. */
export const PdfViewer = forwardRef<Viewer | undefined, PdfViewerProps>(function PdfViewer(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [viewer, setViewer] = useState<Viewer>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: another language or bar is another viewer; the rest is read when it is mounted.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const p = latest.current;
    const made = mountViewer(el, {
      ...p,
      onChange: (pdf) => latest.current.onChange?.(pdf),
      onPage: (id) => latest.current.onPage?.(id),
    });
    setViewer(made);
    return () => {
      made.destroy();
      setViewer(undefined);
    };
  }, [props.locale, props.toolbar, props.download, props.fill]);

  useEffect(() => {
    if (viewer && viewer.pdf !== props.pdf) viewer.setPdf(props.pdf);
  }, [viewer, props.pdf]);
  useEffect(() => viewer?.setTheme(props.theme ?? 'system'), [viewer, props.theme]);

  useImperativeHandle(ref, () => viewer, [viewer]);
  return <div ref={host} className={props.className} style={{ height: '100%', ...props.style }} />;
});

export interface PdfEditorProps extends EditorOptions, Box {}

/** A PDF worked on: highlights, notes, drawing, text, signatures, the form, its pages, undone and saved. */
export const PdfEditor = forwardRef<Editor | undefined, PdfEditorProps>(function PdfEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [editor, setEditor] = useState<Editor>();
  /** What the editor said last: given back as the prop, it is not opened again. */
  const told = useRef<Pdf | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: another language, or files or saving given or taken, is another editor; the rest is read when it is mounted.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const p = latest.current;
    const made = mountEditor(el, {
      ...p,
      pdf: told.current ?? p.pdf,
      onChange: (pdf) => {
        told.current = pdf;
        latest.current.onChange?.(pdf);
      },
      onSave: p.onSave && ((bytes, pdf) => latest.current.onSave?.(bytes, pdf)),
    });
    setEditor(made);
    return () => {
      made.destroy();
      setEditor(undefined);
    };
  }, [props.locale, props.files, !!props.onSave]);

  useEffect(() => {
    if (!editor || !props.pdf || props.pdf === told.current || props.pdf === editor.pdf) return;
    told.current = props.pdf;
    editor.setPdf(props.pdf);
  }, [editor, props.pdf]);
  useEffect(() => editor?.viewer?.setTheme(props.theme ?? 'system'), [editor, props.theme]);

  useImperativeHandle(ref, () => editor, [editor]);
  return <div ref={host} className={props.className} style={{ height: '100%', ...props.style }} />;
});

export interface PdfFile {
  pdf?: Pdf;
  error?: Error;
  loading: boolean;
}

/** A PDF opened from its bytes, a File, or an address to fetch it from, as it is opened. */
export function usePdf(source: Uint8Array | Blob | string | undefined, options: { name?: string; password?: string } = {}): PdfFile {
  const [state, setState] = useState<PdfFile>({ loading: !!source });
  const { name, password } = options;
  useEffect(() => {
    if (!source) {
      setState({ loading: false });
      return;
    }
    let live = true;
    setState({ loading: true });
    (async () => {
      const bytes = typeof source === 'string' ? new Uint8Array(await (await fetch(source)).arrayBuffer()) : source instanceof Uint8Array ? source : new Uint8Array(await source.arrayBuffer());
      const named = name ?? (typeof source === 'string' ? decodeURIComponent(source.split(/[?#]/)[0].split('/').pop() || '') : source instanceof File ? source.name : undefined);
      return openPdf(bytes, { name: named || undefined, password });
    })().then(
      (pdf) => live && setState({ pdf, loading: false }),
      (error: Error) => live && setState({ error, loading: false }),
    );
    return () => {
      live = false;
    };
  }, [source, name, password]);
  return state;
}
