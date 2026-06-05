import { Dexie } from "https://unpkg.com/dexie/dist/modern/dexie.mjs";
import "https://unpkg.com/turndown/lib/turndown.browser.umd.js";
import { gfm } from "https://unpkg.com/@truto/turndown-plugin-gfm";
import { marked } from "https://unpkg.com/marked/lib/marked.esm.js";
import markedFootnote from "https://unpkg.com/marked-footnote/dist/index.js";
import "https://cdnjs.cloudflare.com/ajax/libs/js-beautify/1.15.4/beautify-css.js";

const db = new Dexie("MiniMaxEditor");

function beautifyCSS(css) {
  return window.css_beautify(css);
}

async function initDatabase() {
  db.version(1).stores({
    documents: "++id, name, timestamp",
  });
}

async function deleteDatabase() {
  db.delete();
}

async function getDocumentByName(name) {
  return db.documents.where("name").equals(name).first();
}

async function getEditorSettings() {
  let settings = await db.settings.where("name").equals("editor").first();
  if (!settings) {
    settings = { name: "editor", settings: {} };
    await db.settings.add(settings);
  }
  return await db.settings.where("name").equals("editor").first();
}

async function updateEditorSettings(settings) {
  let previousSettings = await getEditorSettings();
  await db.settings.update(settings.id, {
    settings: { ...previousSettings.value, ...settings.value },
  });
}

async function getLatestDocument() {
  return await db.documents.orderBy("timestamp").last();
}

async function updateOrCreateDocument({
  name,
  html,
  title,
  stylesheets,
  customStyle,
} = {}) {
  let existing = await getDocumentByName(name);
  if (existing) {
    await db.documents.update(existing.id, {
      html,
      title,
      stylesheets,
      customStyle,
      timestamp: new Date().getTime(),
    });
  } else {
    await db.documents.add({
      name,
      html,
      title,
      stylesheets,
      customStyle,
      timestamp: new Date().getTime(),
    });
  }
  return await getDocumentByName(name);
}

export class MiniMaxEditor {
  keepLatestDocumentsInLocalDatabase = 1;
  wrapInSectionIfNoEditableSectionIsFound = true;
  editableTagElements = [
    "section",
    "figure",
    "aside",
    "footer",
    "header",
    "hgroup",
  ];

  #title = "";
  #stylesheets = "";
  #customStyle = "";
  #customStyleSheetTextarea = null;
  #titleInput = null;

  constructor(target) {
    this.#init(target);
  }
  #init(
    target = document.querySelector("minimax-editor") ||
      document.querySelector(".minimax-editor"),
  ) {
    let html = target.innerHTML;
    let classList = target.classList.toString();
    let div = document.createElement("div");
    target.replaceWith(div);
    this.targetContainer = div;
    this.targetContainer.setAttribute("class", classList);
    this.targetContainer.classList.add("minimax-editor");
    this.targetContainer.innerHTML = html;
    if (!this.turndownService) {
      this.#initTurndown();
    }

    this.#title = "";
    this.#stylesheets = "";
    this.#customStyle = "";
    this.#customStyleSheetTextarea = null;
    this.#titleInput = null;
    this.#initDropFile();
    this.#initMarkdownEditor();
    this.#initEditorButtons();
    this.#initStylesheetSelection();
    this.#initElementTagsSelect();
    this.#initTitleInput();
    this.#initFullWidthToggle();

    document.querySelector("body").addEventListener("click", (ev) => {
      // clicked outside of editor or editable elements?
      if (
        !ev.target.closest('[editable="minimax"]') &&
        !ev.target.closest(".minimax-editor")
      ) {
        this.markdownEditorContainer.disabled = true;
        this.selectedElementForEditing = null;
        this.markdownEditorContainer.value = "";
        // remove all .is-selected-for-editing classes
        this.editableContainer
          .querySelectorAll(".is-selected-for-editing")
          .forEach((el) => el.classList.remove("is-selected-for-editing"));
      }
    });
    const detectShiftKeyPressed = (ev) => {
      this.targetContainer.classList.toggle("shift-key-pressed", ev.shiftKey);
    };
    window.addEventListener("keyup", detectShiftKeyPressed);
    window.addEventListener("keydown", detectShiftKeyPressed);
  }
  async setup() {
    await initDatabase();
    await this.deleteAllDocumentsExceptTheLatest();
  }
  async loadLatestDocument() {
    this.documentRecord = await getLatestDocument();
    if (this.documentRecord) {
      this.initHTMLContent({
        html: this.#cleanupSelectedAndEmptyClassesFromHtml(
          this.documentRecord.html,
        ),
        filename: this.documentRecord.name,
        title: this.documentRecord.title,
        customCSSStyle: this.documentRecord.customStyle,
      });
    }
    return this.documentRecord;
  }
  #initDropFile() {
    if (!this.targetContainer.querySelector("drop-file")) {
      console.warn("No drop-file element found");
      return;
    }
    let div = document.createElement("div");
    this.targetContainer.querySelector("drop-file").replaceWith(div);
    div.innerHTML = `
      <div class="file-drop-area">
        <button>Import html file</button>
        <input type="file" />
      </div>
    `;
    this.dropFileContainer = div;
    this.dropFileContainer
      .querySelector("button")
      .addEventListener("click", (ev) =>
        this.dropFileContainer.querySelector("input[type='file']").click(),
      );

    this.dropFileContainer
      .querySelector("input[type='file']")
      .addEventListener("change", (event) => {
        const file = event.target.files[0];
        if (file) {
          const filename = file.name;

          const reader = new FileReader();
          reader.onload = (e) => {
            const html = e.target.result;
            this.initHTMLContent({ html, filename });
            updateOrCreateDocument({
              name: filename,
              html,
              title: this.#title,
              stylesheets: this.#stylesheets,
              customStyle: this.#customStyle,
            });
          };
          reader.readAsText(file);
        }
      });
  }
  #initMarkdownEditor() {
    if (!this.targetContainer.querySelector("markdown-editor")) {
      console.warn("No markdown-editor element found");
      return;
    }
    this.markdownEditorContainer =
      this.targetContainer.querySelector("markdown-editor");

    let textarea = document.createElement("textarea");
    textarea.rows = 5;
    this.markdownEditorContainer.replaceWith(textarea);
    this.markdownEditorContainer = textarea;

    this.markdownEditorContainer.addEventListener(
      "input",
      this.#handleMarkdownInput.bind(this),
    );
    this.markdownEditorContainer.addEventListener("dragover", (e) =>
      e.preventDefault(),
    );
    this.markdownEditorContainer.addEventListener(
      "drop",
      this.#handleMarkdownDrop.bind(this),
    );
  }
  #initTurndown() {
    this.turndownService = new TurndownService({
      codeBlockStyle: "fenced",
      hr: "---",
      headingStyle: "atx",
    });
    this.turndownService.keep([
      "aside",
      "footer",
      "section",
      "picture",
      "audio",
      "video",
      "iframe",
      "figure",
      "figcaption",
      "div",
      "sidenote",
    ]);
    this.turndownService.use(gfm);
  }
  setTitle(title) {
    this.#title = title;
    if (document.querySelector("head title")) {
      document.querySelector("head title").innerText = title;
    }
    if (this.#titleInput) {
      this.#titleInput.value = title;
    }
  }
  setCustomStyle(style) {
    this.#customStyle = beautifyCSS(style);
    let styleContainer =
      document.querySelector('style[type="text/css"]') ||
      document.querySelector("style");
    if (!styleContainer) {
      styleContainer = document.createElement("style");
      styleContainer.setAttribute("type", "text/css");
      document.body.appendChild(styleContainer);
    }
    styleContainer.innerHTML = style;
  }
  #collectStyleSheetsFromDocument(doc) {
    const customStyle =
      doc.querySelector(`style[type="text/css"]`) || doc.querySelector(`style`);
    return {
      links: [
        ...doc.querySelectorAll(
          `head link[rel="stylesheet"]:not([disabled]):not([exclude-from-export])`,
        ),
      ],
      customStyle: customStyle?.innerHTML,
    };
  }
  async initHTMLContent({ html, title, stylesheets, customCSSStyle } = {}) {
    let parser = new DOMParser();
    if (!html) {
      alert("No HTML content provided");
      return;
    }
    let doc = parser.parseFromString(html, "text/html");

    document.querySelector(`[editable="minimax"]`).innerHTML =
      (
        doc.querySelector(`[editable="minimax"]`) ||
        doc.querySelector(`article`) ||
        doc.querySelector(`section`)
      )?.innerHTML || "";

    let { customStyle } = this.#collectStyleSheetsFromDocument(doc);
    // append to body
    if (customCSSStyle) {
      customStyle = customCSSStyle;
    }
    if (customStyle) {
      let styleContainer = document.createElement("style");
      styleContainer.setAttribute("type", "text/css");
      styleContainer.innerHTML = customStyle;
      document.body.appendChild(styleContainer);
      this.setCustomStyle(customStyle);
      if (this.#customStyleSheetTextarea) {
        this.#customStyleSheetTextarea.value = beautifyCSS(customStyle);
      }
    }
    if (stylesheets === undefined || stylesheets === null) {
      const { links } = this.#collectStyleSheetsFromDocument(doc);
      if (links?.length > 0) {
        const allLinks = document.querySelectorAll(
          'head link[rel="stylesheet"]',
        );
        const filteredLinks = links
          .map((link) => {
            const existingLink = [...allLinks].filter(
              (l) => l.getAttribute("href") === link.getAttribute("href"),
            )[0];
            if (existingLink) {
              existingLink.disabled = link.disabled;
              return null;
            }
            return link;
          })
          .filter((link) => !!link);
        // append links html to head
        document.querySelector("head").innerHTML +=
          `\n${filteredLinks.map((link) => link.outerHTML).join(`\n`)}`;
      }
    } else {
      document.querySelector("head").innerHTML += `\n${stylesheets || ""}`;
    }

    this.editableContainer = document.querySelector(`[editable="minimax"]`);
    let editableSections = this.editableContainer.querySelectorAll(
      this.editableTagElements.join(", "),
    );
    if (
      editableSections.length === 0 &&
      this.wrapInSectionIfNoEditableSectionIsFound
    ) {
      this.editableContainer.innerHTML = `<section>${this.editableContainer.innerHTML}</section>`;
      editableSections = this.editableContainer.querySelectorAll(
        this.editableTagElements.join(", "),
      );
    }
    editableSections.forEach((el) => this.#handleClickOnEditableSection(el));
    this.setTitle(title || doc.querySelector("title")?.innerText);
    this.#initStylesheetSelection();
  }
  #handleClickOnEditableSection(el) {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.selectedElementForEditing = el;
      this.markdownEditorContainer.disabled = false;
      this.markdownEditorContainer.value = this.turndownService.turndown(
        el.innerHTML,
      );
      this.markdownEditorContainer.focus();
      this.editableContainer
        .querySelectorAll(".is-selected-for-editing")
        .forEach((el) => el.classList.remove("is-selected-for-editing"));
      const parentElementSection =
        el.closest("section") ||
        el.closest("figure") ||
        el.closest("footer") ||
        el.closest("aside");
      parentElementSection.classList.add("is-selected-for-editing");
      if (this.elementTagsSelect) {
        this.elementTagsSelect
          .querySelectorAll("option[selected]")
          .forEach((el) => {
            el.selected = false;
          });
        let option = this.elementTagsSelect.querySelector(
          `option[value="${parentElementSection.tagName.toLowerCase()}"]`,
        );
        if (option) {
          option.selected = true;
        } else {
          this.elementTagsSelect.querySelector("option").selected = true;
        }
      }
    });
  }
  #cleanupSelectedAndEmptyClassesFromHtml(htmlContent) {
    let parser = new DOMParser();
    // remove all empty classes attributes from htmlContent
    const cleanedHtmlContent = parser.parseFromString(
      htmlContent,
      "text/html",
    ).documentElement;
    cleanedHtmlContent.querySelectorAll("[class]").forEach((el) => {
      if (el.classList.length === 0) {
        el.removeAttribute("class");
      }
      if (
        el.classList.length === 1 &&
        el.classList.contains("is-selected-for-editing")
      ) {
        el.removeAttribute("class");
      }
    });
    cleanedHtmlContent.querySelectorAll("section").forEach((section) => {
      if (section.outerHTML === `<section></section>`) {
        section.remove();
      }
    });
    return cleanedHtmlContent.outerHTML;
  }
  #exportFile() {
    const parser = new DOMParser();
    const htmlContent = this.#cleanupSelectedAndEmptyClassesFromHtml(
      this.documentRecord.html,
    );
    const doc = parser.parseFromString(
      htmlContent,
      "text/html",
    ).documentElement;

    let head = this.head;
    if (head === null || head === undefined) {
      head =
        `<title>{{title}}</title>\n` +
        [
          ...document.querySelectorAll(
            `head link[rel="stylesheet"]:not([exclude-from-export]):not([disabled])`,
          ),
        ]
          .map((e) => e.outerHTML)
          .join(`\n`);
    }
    head = head.replace(
      "{{title}}",
      this.documentRecord.title || this.documentRecord.name,
    );

    const customCSSStyle = this.#customStyle
      ? `\n<style type="text/css">\n${this.#customStyle}\n</style>\n`
      : "";

    const blob = new Blob(
      [
        `<!DOCTYPE html>\n<html>\n<head>\n${head}\n</head>\n<body>\n<main>${(doc.querySelector("body main") || doc.querySelector("body")).innerHTML}</main>${customCSSStyle}\n</body>\n</html>\n`,
      ],
      {
        type: "text/html",
      },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const filename =
      this.documentRecord.title?.replace(/[^\p{Letter}\.\-_\s]+/giu, "") ||
      this.documentRecord.name;
    a.href = url;
    a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  #moveUp(ev) {
    if (!this.selectedElementForEditing) {
      return;
    }
    let previousSibling = this.selectedElementForEditing.previousElementSibling;
    if (previousSibling) {
      previousSibling.insertAdjacentElement(
        "beforebegin",
        this.selectedElementForEditing,
      );
    }
    this.selectedElementForEditing.scrollIntoView();
    this.#storeDocument();
  }
  #moveDown(ev) {
    if (!this.selectedElementForEditing) {
      return;
    }
    let nextSibling = this.selectedElementForEditing.nextElementSibling;
    if (nextSibling) {
      nextSibling.insertAdjacentElement(
        "afterend",
        this.selectedElementForEditing,
      );
    }
    this.selectedElementForEditing.scrollIntoView();
    this.#storeDocument();
  }
  #duplicate() {
    if (!this.selectedElementForEditing) {
      return;
    }
    let clone = this.selectedElementForEditing.cloneNode(true);
    this.selectedElementForEditing.insertAdjacentElement("afterend", clone);
    this.selectedElementForEditing.classList.remove("is-selected-for-editing");
    this.selectedElementForEditing = clone;
    this.selectedElementForEditing.scrollIntoView();
    this.#handleClickOnEditableSection(clone);
    this.#storeDocument();
  }
  #insertBeforeOrAfter() {
    if (!this.selectedElementForEditing) {
      return;
    }
    let newText = `Edit text here…`;
    let newElement = document.createElement("section");
    newElement.innerHTML = `<p>${newText}</p>`;

    const insertBefore =
      this.targetContainer.classList.contains("shift-key-pressed");

    if (insertBefore) {
      this.selectedElementForEditing.insertAdjacentElement(
        "beforebegin",
        newElement,
      );
    } else {
      this.selectedElementForEditing.insertAdjacentElement(
        "afterend",
        newElement,
      );
    }

    newElement.classList.add("is-selected-for-editing");

    this.selectedElementForEditing.classList.remove("is-selected-for-editing");
    this.selectedElementForEditing = newElement;
    this.markdownEditorContainer.value = newText;
    this.selectedElementForEditing.scrollIntoView();
    this.#handleClickOnEditableSection(newElement);
    this.#storeDocument();
  }
  #makeElementSelectedForEditing(el) {
    this.selectedElementForEditing = el;
    this.selectedElementForEditing.click();
  }
  #deleteElement() {
    if (!this.selectedElementForEditing) {
      return;
    }
    // get next element of this.selectedElementForEditing
    let nextElement = this.selectedElementForEditing.nextElementSibling;
    this.selectedElementForEditing.remove();
    this.selectedElementForEditing = null;
    this.markdownEditorContainer.value = "";
    if (nextElement) {
      this.#makeElementSelectedForEditing(nextElement);
      nextElement.scrollIntoView();
    }
    this.#storeDocument();
  }
  async deleteAllDocumentsExceptTheLatest() {
    let n = Number(this.keepLatestDocumentsInLocalDatabase);
    const totalCount = await db.documents.count();
    if (totalCount > n) {
      console.debug(
        `There are ${totalCount} documents, deleting all except the latest ${n}`,
      );
      const toDelete = await db.documents
        .orderBy("timestamp")
        .reverse()
        .offset(n)
        .toArray();
      const idsToDelete = toDelete.map((doc) => doc.id);
      await db.documents.bulkDelete(idsToDelete);
    }
  }
  async #newDocument() {
    if (!confirm("Sure? All previous data will be cleared in the browser.")) {
      return;
    }
    await deleteDatabase();
    await initDatabase();
    const title = prompt("Title of document", "Untitled");
    const name = (title || "untitled").replace(/(\.html)*$/i, ".html");
    await db.open();
    this.setDocumentTitleAndHtml({ title, name });
    // this.#init();
    // TODO: make this work without reloading the page… (init variables, elements etc)
    window.location.reload();
  }
  async setDocumentTitleAndHtml({
    name,
    title = "Hello 👋",
    html,
    text = "Change text here…",
  } = {}) {
    if (!name) {
      name = title;
    }
    if (!html) {
      html = `<!DOCTYPE html>\n<html><head><title>${title}</title></head>\n<body><main><article editable="minimax"><section><h1>${title}</h1></section><section><p>${text}</p></section></article></main>\n</body></html>`;
    }
    this.setTitle(title);
    await updateOrCreateDocument({
      name,
      html,
      title,
    });
    await this.loadLatestDocument();

    this.editableContainer.querySelector("section:last-child").click();
  }
  #initEditorButtons() {
    const buttons = [
      {
        selector: "export-file",
        action: this.#exportFile.bind(this),
        name: "Export as html-file",
      },
      {
        selector: "move-up",
        action: this.#moveUp.bind(this),
        name: "Move up",
      },
      {
        selector: "move-down",
        action: this.#moveDown.bind(this),
        name: "Move down",
      },
      {
        selector: "duplicate",
        action: this.#duplicate.bind(this),
        name: "Duplicate",
      },
      {
        selector: "insert",
        action: this.#insertBeforeOrAfter.bind(this),
        name: "Insert After",
        nameShift: "Insert Before",
      },
      {
        selector: "delete",
        action: this.#deleteElement.bind(this),
        name: "Delete",
      },
      {
        selector: "new-document",
        action: this.#newDocument.bind(this),
        name: "New",
      },
    ];
    buttons.forEach(({ selector, action, name, nameShift }) => {
      let target = this.targetContainer.querySelector(selector);
      if (!target) {
        console.warn(`Button with selector ${selector} not found… Skipping`);
        return;
      }
      let button = document.createElement("button");
      button.classList.add("editor-button");
      button.classList.add(selector);
      button.setAttribute("aria-label", name || selector);
      button.dataset.shiftLabel = nameShift || name || selector;
      // button.innerText = name || selector;
      button.addEventListener("click", action);
      target.replaceWith(button);
    });
    let collapseBar = this.targetContainer.querySelector("collapse-bar");
    if (collapseBar) {
      let div = document.createElement("div");
      div.innerHTML = `<input type="checkbox" /><button></button>`;
      div.classList.add("collapse-bar");
      let checkbox = div.querySelector("input");
      let button = div.querySelector("button");
      button.addEventListener("click", (ev) => {
        checkbox.checked = !checkbox.checked;
      });
      collapseBar.replaceWith(div);
    }
  }
  #initStylesheetSelection() {
    let styleSheetTarget = this.targetContainer.querySelector("stylesheets");
    if (styleSheetTarget) {
      let html = `<form><section>`;
      [
        ...document.querySelectorAll(
          'head link[rel="stylesheet"]:not([exclude-from-export])',
        ),
      ].forEach((sheet) => {
        html += `
          <section>
            <label for="${sheet.getAttribute("href").replace(/[^\w0-9]+/g, "_")}">${sheet.getAttribute("href")}</label>
            <input id="${sheet.getAttribute("href").replace(/[^\w0-9]+/g, "_")}" data-href="${sheet.getAttribute("href")}" type="checkbox" ${sheet.disabled ? "" : ' checked="checked '}" />
          </section>`;
      });
      html += `\n</section></form>`;
      styleSheetTarget.innerHTML = html;
      styleSheetTarget
        .querySelectorAll('input[type="checkbox"]')
        .forEach((input) => {
          input.addEventListener("change", (ev) => {
            document.querySelector(
              `head link[href="${input.dataset.href}"]`,
            ).disabled = !input.checked;
          });
        });
    }

    let customStyleTarget = this.targetContainer.querySelector("customStyle");

    if (customStyleTarget) {
      let textarea = document.createElement("textarea");
      textarea.placeholder = "Custom CSS that will be included in export";
      textarea.rows = 5;

      customStyleTarget.replaceWith(textarea);
      this.#customStyleSheetTextarea = textarea;
      textarea.addEventListener("input", (ev) => {
        this.setCustomStyle(textarea.value);
        this.#storeDocument();
      });
    }
  }
  #initElementTagsSelect() {
    let target = this.targetContainer.querySelector("element-tags");
    if (!target) {
      return;
    }
    let html = `<form><section><select>`;
    this.editableTagElements.forEach((tagName) => {
      html += `<option value="${tagName}">${tagName}</option>`;
    });
    target.innerHTML = html;
    target.addEventListener("change", (ev) => {
      let newTag = ev.target.value;
      let element = document.createElement(newTag);
      element.classList.add("is-selected-for-editing");
      element.innerHTML = this.selectedElementForEditing.innerHTML;
      this.selectedElementForEditing.replaceWith(element);
      this.selectedElementForEditing = element;
      this.#handleClickOnEditableSection(element);
      this.#storeDocument();
    });
    this.elementTagsSelect = target;
  }
  #initTitleInput() {
    let target = this.targetContainer.querySelector("title");
    if (!target) {
      return;
    }
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Title";
    const onChange = () => {
      this.setTitle(input.value);
      this.#storeDocument();
    };
    input.addEventListener("change", onChange);
    input.addEventListener("keyup", onChange);
    this.#titleInput = input;
    target.replaceWith(input);
  }
  #initFullWidthToggle() {
    let target = this.targetContainer.querySelector("full-width-toggle");
    if (!target) {
      return;
    }
    const section = document.createElement("section");
    section.classList.add("full-width-toggle");
    section.innerHTML = `<label for="toggle-fill-width"><button>↔</button></label><input id="toggle-fill-width" type="checkbox" />`;
    const checkbox = section.querySelector('input[type="checkbox"]');
    section
      .querySelector("button")
      .addEventListener("click", () => (checkbox.checked = !checkbox.checked));
    target.replaceWith(section);
  }
  async #handleMarkdownInput(event) {
    if (this.selectedElementForEditing) {
      this.selectedElementForEditing.innerHTML = marked
        .use(markedFootnote)
        .parse(
          this.markdownEditorContainer.value.trim()
            ? this.markdownEditorContainer.value
            : "<p>&nbsp;</p>",
        )
        // remove single images wrapped in paragraphs
        .replace(/<p><img(.*?)><\/p>/g, "<img$1>");
      await this.#storeDocument();
    }
  }
  async #storeDocument(name = this.documentRecord.name) {
    if (!this.keepLatestDocumentsInLocalDatabase) {
      this.documentRecord = {
        name: "untitled.html",
        title: this.#title || "Untitled",
        customStyle: this.#customStyle,
        html: `<!DOCTYPE html>\n<html><head><title>${this.#title}</title></head>\n<body>\n${document.querySelector('[editable="minimax"]').outerHTML}\n</body></html>`,
      };
      return;
    }
    // TODO: check <head>/<meta> and add custom <style>
    this.documentRecord = await updateOrCreateDocument({
      name,
      title: this.#title,
      customStyle: this.#customStyle,
      html: `<!DOCTYPE html>\n<html><head><title>${this.documentRecord.name}</title></head>\n<body>\n${document.querySelector('[editable="minimax"]').outerHTML}\n</body></html>`,
    });
  }
  #handleMarkdownDrop(event) {
    event.preventDefault(); // for chrome, to stop opening image
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];

      // Ensure it is an image
      if (file.type.startsWith("image/")) {
        let caption = prompt(
          "What caption has the image? Type `(left)` or `(right)` to align the picture:",
        );
        const reader = new FileReader();

        reader.onload = (event) => {
          let imageData = `![${file.name}](${event.target.result})`;

          if (caption && /\((left|right)\)/i.test(caption)) {
            let text = caption.replace(/\s*\((left|right)\)\s*/i, "").trim();
            imageData = `<aside><picture><img src="${event.target.result}" alt="${text}"></picture>${text ? "\n" + text + "\n" : ""}</aside>`;
          }

          this.markdownEditorContainer.value += `\n${imageData}\n`;
          // trigger input
          this.markdownEditorContainer.dispatchEvent(
            new Event("input", { bubbles: true }),
          );
        };

        reader.readAsDataURL(file);
      }
    }
  }
}
