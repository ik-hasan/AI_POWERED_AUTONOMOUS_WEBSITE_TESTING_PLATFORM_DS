import { TestStep } from '../types';

const VALID_ROLES = new Set([
  'alert', 'alertdialog', 'button', 'checkbox', 'dialog', 'gridcell', 'link',
  'log', 'marquee', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option',
  'progressbar', 'radio', 'scrollbar', 'searchbox', 'slider', 'spinbutton',
  'status', 'switch', 'tab', 'tabpanel', 'textbox', 'tooltip', 'treeitem',
  'combobox', 'menu', 'menubar', 'tablist', 'tree', 'treegrid', 'grid',
  'listbox', 'row', 'rowgroup', 'columnheader', 'rowheader', 'heading',
]);

/**
 * Fix common, site-agnostic locator format mistakes before execution.
 * These rules only correct the SHAPE of a locator (strategy/selector/value);
 * they never hardcode selectors for a specific website.
 */
export function normalizeTestSteps(steps: TestStep[]): TestStep[] {
  return steps.map((step) => normalizeStep(step));
}

function normalizeStep(step: TestStep): TestStep {
  const { locatorStrategy = 'css', selector, value } = step;

  if (!selector) {
    return { ...step, locatorStrategy, selector, value };
  }

  // Playwright-style ":has-text('X')" pseudo-selector -> our text strategy.
  if (selector.includes(':has-text(')) {
    const match = selector.match(/:has-text\(['"](.+?)['"]\)/);
    if (match) {
      return { ...step, locatorStrategy: 'text', selector: match[1], value };
    }
  }

  if (locatorStrategy === 'role') {
    // "role|Accessible Name" packed into a single selector -> split into parts.
    if (selector.includes('|')) {
      const [role, name] = selector.split('|', 2).map((s) => s.trim());
      if (VALID_ROLES.has(role.toLowerCase())) {
        return { ...step, locatorStrategy: 'role', selector: role.toLowerCase(), value: name || value };
      }
    }

    // Valid role but mis-cased (e.g. "Button") -> normalize casing.
    if (VALID_ROLES.has(selector.toLowerCase())) {
      return { ...step, locatorStrategy: 'role', selector: selector.toLowerCase(), value };
    }

    // Selector is not a valid ARIA role: the model likely put the visible
    // name/text in the selector. Recover generically without assuming a site:
    //  - fill/press target inputs -> textbox role, name goes to value
    //  - anything else -> match by visible text
    if (step.action === 'fill' || step.action === 'press') {
      return { ...step, locatorStrategy: 'role', selector: 'textbox', value: value || selector };
    }
    return { ...step, locatorStrategy: 'text', selector, value };
  }

  // Visible text stuffed into a CSS/XPath selector is not a real locator
  // (Playwright would look for a tag with that name). Treat it as text.
  if ((locatorStrategy === 'css' || locatorStrategy === 'xpath') && looksLikeVisibleText(selector)) {
    if (step.action === 'click' || step.action === 'hover' || step.action === 'assert') {
      return { ...step, locatorStrategy: 'text', selector, value };
    }
  }

  return { ...step, locatorStrategy, selector, value };
}

const HTML_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'div', 'span', 'p', 'h1', 'h2', 'h3',
  'h4', 'nav', 'form', 'img', 'label', 'li', 'ul', 'ol', 'table', 'tr', 'td', 'th',
  'header', 'footer', 'main', 'section', 'article', 'body', 'html',
]);

function looksLikeVisibleText(selector: string): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return false;
  if (/[#.\[\]>=:~(),/+]/.test(trimmed)) return false;
  if (HTML_TAGS.has(trimmed.toLowerCase())) return false;
  return true;
}
