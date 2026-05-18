import { applyDetailsAutoheight } from "./js/details_autoheight.mjs";
import { applyTextareaAutoheight } from "./js/textarea_autoheight.mjs";
import { lazyload } from "./js/lazyload.mjs";

if (!window.matchMedia(`(prefers-reduced-motion: reduce)`)?.matches) {
  applyDetailsAutoheight("details[autoheight]");
}
applyTextareaAutoheight();
lazyload("img");
