export const lazyload = (selector) => {
  function addBehaviourTo(elements) {
    elements.forEach((e) => {
      if (e.lazyload) {
        return;
      }
      e.lazyload = true;
      if (e.complete) {
        return;
      }

      e.addEventListener("error", () => e.classList.add("error-during-loading"));
    });
  }

  addBehaviourTo(document.querySelectorAll(selector));

  new MutationObserver((mutations) => {
    Array.from(mutations).forEach((mutation) => {
      Array.from(mutation.addedNodes).forEach((node) => {
        if (!node.querySelectorAll) {
          return;
        }
        addBehaviourTo(node.querySelectorAll(selector));
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
};
