// The API of @rebopdf/editor: a PDF worked on in the page.

export { COLORS, Editor, type EditorOptions, mergeLines, mountEditor, type Tool } from './editor';
export { EDITOR_STRINGS, type EditorStrings, editorStringsFor } from './i18n';
export { askSignature, normalize, type Signature } from './signature';
export { injectEditorStyles } from './styles';
