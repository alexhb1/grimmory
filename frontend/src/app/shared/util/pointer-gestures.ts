const applePlatform = /Mac/i.test(navigator.platform);

export function isContextMenuGesture(event: MouseEvent): boolean {
  return applePlatform && event.ctrlKey;
}

export function isPlainLeftClick(event: MouseEvent): boolean {
  return event.button === 0
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && !event.altKey;
}
