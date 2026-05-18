# minimaxCSS
## Opinionated minimal CSS setup with maximum effect

### Demos

* [Misc](https://pstaender.github.io/minimaxcss/examples/misc.html)
* [Article](https://pstaender.github.io/minimaxcss/examples/article.html)
* [Book I](https://pstaender.github.io/minimaxcss/examples/book.html)
* [Book II](https://pstaender.github.io/minimaxcss/examples/max_moritz.html)
* [Forms](https://pstaender.github.io/minimaxcss/examples/forms.html)
* [Convert markdown to html for testing](https://pstaender.github.io/minimaxcss/examples/markdown.html)
* [Readme](https://pstaender.github.io/minimaxcss/)

### Goals

- use default html components instead of class-overloaded div-elements:
  - e.g.: use `hr` instead of `<div class="separator-line"></div>`, `<details>…≤/details>` instead of `<div class="accordion">…≤/div>` etc…
- customize specific layout via css variables
- use `<section>` for structuring content and forms
- enables lazy-loading on images
- responsive – whenever it makes sense (mobile, desktop, dark-mode, print …)
- works on Chrome/Edge, Safari **and** Firefox

### Usage

Add `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/minimaxcss/minimax.css" />` for layout and `<script src="https://cdn.jsdelivr.net/npm/minimaxcss/minimax.mjs" type="module"></script>` for additional js features (image lazy-loading and autoheight features).

### Forms

Use class `form` to enable form layout:

```html
<form class="form">
  <section>
    <section>
      <label for="name">Your name:</label>
      <input type="text" />
    <section>
    <footer>
      <button role="submit">Sign up</button>
    </footer>
  </section>
</form>
```

<img style="width: 500px; aspect-ratio: 1.152;" alt="form" src="https://github.com/user-attachments/assets/cf9ba4ad-ac1b-4a21-9d14-b6fb04c6e51a" />



### Autoheight

Let auto adjust the height on the following elements (js file needs to be included for that):

#### Details

```html
<details class="boxed" autoheight>
  <summary>Details</summary>
  <section>…</section>
</details>
```

<img width="776" height="64" alt="details" src="https://github.com/user-attachments/assets/0f54c677-609d-4335-9098-cb0e21bc65ee" />

#### Textarea

```html
<textarea autoheight>…</textarea>
```

### `<hr>`
#### Use `<hr>` to add page breaks for printing

Add two `<hr>` elements after each other:

```html
<hr>
<hr>
```

Only one separator-line will be seen on screen. No separator-line will be visible on the printing layout.

#### `<hr>` in ornament style

```html
<hr class="ornament">
```

### Serif font style for traditional book-like-layout

Add `<link rel="stylesheet" href="minimax-serif.css" />`.

You can now enjoy a fancy separator-line with an ornament:



<img width="970" height="47" alt="ornament" src="https://github.com/user-attachments/assets/ca31d526-0588-4fbe-b845-8d2b49f8191f" />


### First-Letter

```html
<p class="first-letter">The first letter `T` will be placed prominently of three lines.</p>
```

<img width="696" height="231" alt="first-letter" src="https://github.com/user-attachments/assets/60a75154-0c12-458d-8833-8ce333d0e360" />

### Modify important CSS-variables for your needs

```css
--accent-color: …;
--accent-text-color: …;
--active-color: …;
```

### License

[See License](./tree/main/LICENSE)
