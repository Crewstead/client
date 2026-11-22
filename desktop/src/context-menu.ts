import {
  clipboard,
  Menu,
  type BrowserWindow,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
} from 'electron';

/** What a right click offers, from what is under the pointer. Empty: no menu. */
export function menuItems(
  params: Pick<
    ContextMenuParams,
    | 'mediaType'
    | 'isEditable'
    | 'editFlags'
    | 'selectionText'
    | 'linkURL'
    | 'misspelledWord'
    | 'dictionarySuggestions'
  >,
  actions: {
    copyImage: () => void;
    copyLink: (url: string) => void;
    replace: (word: string) => void;
  },
): MenuItemConstructorOptions[] {
  const groups: MenuItemConstructorOptions[][] = [];
  if (params.misspelledWord && params.dictionarySuggestions.length)
    groups.push(
      params.dictionarySuggestions
        .slice(0, 5)
        .map((word) => ({ label: word, click: () => actions.replace(word) })),
    );
  if (params.mediaType === 'image')
    groups.push([{ label: 'Copy image', click: actions.copyImage }]);
  if (params.isEditable)
    groups.push(
      [
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
      ],
      [{ role: 'selectAll' }],
    );
  else if (params.selectionText.trim()) groups.push([{ role: 'copy' }]);
  if (params.linkURL && !params.isEditable)
    groups.push([{ label: 'Copy link', click: () => actions.copyLink(params.linkURL) }]);
  return groups.flatMap((group, at) => (at ? [{ type: 'separator' as const }, ...group] : group));
}

/**
 * The page's right-click menu, which Electron leaves out (a browser has its own): copy a picture in a
 * chat or the picture viewer, copy selected text or a link, and cut, copy and paste in a text field.
 */
export function contextMenu(window: BrowserWindow) {
  window.webContents.on('context-menu', (_event, params) => {
    const page = window.webContents;
    const items = menuItems(params, {
      copyImage: () => page.copyImageAt(params.x, params.y),
      copyLink: (url) => clipboard.writeText(url),
      replace: (word) => page.replaceMisspelling(word),
    });
    if (items.length) Menu.buildFromTemplate(items).popup({ window });
  });
}
