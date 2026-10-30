// The API of @rebopdf/viewer: a PDF shown in the page.

export { type ComparisonOptions, type ComparisonView, mountComparison } from './comparison';
export { fill, type Locale, STRINGS, type Strings, stringsFor } from './i18n';
export { type IconName, icon } from './icons';
export { fieldLabel, type Geometry, geometryOf, makeOption, noteIcon, pathData, renderFields, renderMarks } from './layers';
export type { MenuEntry, MenuSection, Theme } from './menu';
export { injectViewerStyles } from './styles';
export { mountViewer, type PageView, type Region, Viewer, type ViewerOptions, type Zoom } from './viewer';
