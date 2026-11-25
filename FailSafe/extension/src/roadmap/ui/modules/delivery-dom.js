/** DOM helpers shared by the Workspace "Delivery" sub-view modules. Text is set with textContent, never as HTML. */

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function button(label, cls, onClick) {
  const b = el('button', `cc-dlv-btn${cls ? ` ${cls}` : ''}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
