import autosize from "./autosize.mjs";

export function applyTextareaAutoheight() {
  Array.from(document.querySelectorAll("textarea[autoheight]")).forEach(autosize);
  // Setup observer to autosize anything after page load
  new MutationObserver((mutations) => {
    Array.from(mutations).forEach((mutation) => {
      Array.from(mutation.addedNodes).forEach((node) => {
        if (!node.matches) {
          return;
        }
        if (node.matches("textarea[autoheight]")) {
          autosize(node);
        }
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
}
