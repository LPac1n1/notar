export const APP_SCROLL_CONTAINER_ID = "app-scroll-container";

export function getAppScrollContainer() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.getElementById(APP_SCROLL_CONTAINER_ID);
}

export function getAppScrollTop() {
  return getAppScrollContainer()?.scrollTop ?? 0;
}

export function scrollAppTo(top, behavior = "auto") {
  getAppScrollContainer()?.scrollTo({ top, behavior });
}
