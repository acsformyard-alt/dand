import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

interface RoleOptions {
  name?: string | RegExp;
}

interface RenderRecord {
  container: HTMLElement;
  root: Root;
  shouldRemove: boolean;
}

const mountedRoots = new Set<RenderRecord>();

export const cleanup = () => {
  for (const entry of Array.from(mountedRoots)) {
    entry.root.unmount();
    if (entry.shouldRemove && entry.container.parentNode) {
      entry.container.parentNode.removeChild(entry.container);
    }
    mountedRoots.delete(entry);
  }
};

export const render = (
  ui: ReactElement,
  options: { container?: HTMLElement; baseElement?: HTMLElement } = {}
) => {
  const baseElement = options.baseElement ?? document.body;
  const container = options.container ?? document.createElement('div');
  if (!options.container) {
    baseElement.appendChild(container);
  }
  const root = createRoot(container);
  root.render(ui);
  const record: RenderRecord = { container, root, shouldRemove: !options.container };
  mountedRoots.add(record);

  return {
    container,
    baseElement,
    rerender(nextUi: ReactElement) {
      root.render(nextUi);
    },
    unmount() {
      root.unmount();
      mountedRoots.delete(record);
      if (record.shouldRemove && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
};

const pointerEventCtor: typeof PointerEvent | typeof MouseEvent =
  typeof PointerEvent === 'function' ? PointerEvent : (MouseEvent as unknown as typeof PointerEvent);
const mouseEventCtor = typeof MouseEvent === 'function' ? MouseEvent : Event;

const dispatch = (element: EventTarget, event: Event) => element.dispatchEvent(event);

const createMouseEvent = (type: string, init: MouseEventInit = {}) =>
  new mouseEventCtor(type, { bubbles: true, cancelable: true, ...init });

const createPointerEvent = (type: string, init: PointerEventInit = {}) =>
  new pointerEventCtor(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? 'mouse',
    ...init,
  });

export const fireEvent = Object.assign(dispatch, {
  load(element: EventTarget) {
    return dispatch(element, new Event('load'));
  },
  pointerDown(element: EventTarget, init: PointerEventInit = {}) {
    return dispatch(element, createPointerEvent('pointerdown', init));
  },
  pointerMove(element: EventTarget, init: PointerEventInit = {}) {
    return dispatch(element, createPointerEvent('pointermove', init));
  },
  pointerUp(element: EventTarget, init: PointerEventInit = {}) {
    return dispatch(element, createPointerEvent('pointerup', init));
  },
  pointerCancel(element: EventTarget, init: PointerEventInit = {}) {
    return dispatch(element, createPointerEvent('pointercancel', init));
  },
  pointerLeave(element: EventTarget, init: PointerEventInit = {}) {
    return dispatch(element, createPointerEvent('pointerleave', init));
  },
  contextMenu(element: EventTarget, init: MouseEventInit = {}) {
    return dispatch(element, createMouseEvent('contextmenu', init));
  },
  click(element: EventTarget, init: MouseEventInit = {}) {
    return dispatch(element, createMouseEvent('click', init));
  },
});

const normalizeText = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';

const matchesRole = (element: Element, role: string) => {
  const explicit = element.getAttribute('role');
  if (explicit && explicit.split(/\s+/).includes(role)) {
    return true;
  }
  const tag = element.tagName.toLowerCase();
  if (role === 'img') {
    return tag === 'img';
  }
  if (role === 'button') {
    if (tag === 'button') return true;
    if (tag === 'input') {
      const type = (element as HTMLInputElement).type.toLowerCase();
      return ['button', 'submit', 'reset'].includes(type);
    }
  }
  if (role === 'textbox') {
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const type = (element as HTMLInputElement).type.toLowerCase();
      return (
        type === '' ||
        ['text', 'search', 'url', 'tel', 'email', 'password'].includes(type)
      );
    }
  }
  if (role === 'slider') {
    return tag === 'input' && (element as HTMLInputElement).type.toLowerCase() === 'range';
  }
  if (role === 'checkbox') {
    return tag === 'input' && (element as HTMLInputElement).type.toLowerCase() === 'checkbox';
  }
  if (role === 'radio') {
    return tag === 'input' && (element as HTMLInputElement).type.toLowerCase() === 'radio';
  }
  if (role === 'spinbutton') {
    return tag === 'input' && (element as HTMLInputElement).type.toLowerCase() === 'number';
  }
  if (role === 'combobox') {
    return tag === 'select' && !(element as HTMLSelectElement).multiple;
  }
  if (role === 'listbox') {
    return tag === 'select' && (element as HTMLSelectElement).multiple;
  }
  return false;
};

const getAccessibleName = (element: Element): string => {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return normalizeText(ariaLabel);
  }
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const doc = element.ownerDocument ?? document;
    const text = ariaLabelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node))
      .map((node) => normalizeText(node.textContent))
      .join(' ');
    if (text) {
      return normalizeText(text);
    }
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const labels = element.labels ? Array.from(element.labels) : [];
    if (labels.length) {
      return normalizeText(labels.map((label) => normalizeText(label.textContent)).join(' '));
    }
  }
  if (element instanceof HTMLImageElement && element.alt) {
    return normalizeText(element.alt);
  }
  return normalizeText(element.textContent);
};

const filterByRole = (elements: Element[], role: string, options: RoleOptions) => {
  const { name } = options;
  return elements.filter((element) => {
    if (!matchesRole(element, role)) {
      return false;
    }
    if (name == null) {
      return true;
    }
    const accessibleName = getAccessibleName(element);
    if (typeof name === 'string') {
      return accessibleName === name;
    }
    return name.test(accessibleName);
  }) as HTMLElement[];
};

const queryAllByRole = (container: Element | Document, role: string, options: RoleOptions = {}) => {
  const elements = [
    ...(container instanceof Element && matchesRole(container, role) ? [container] : []),
    ...Array.from(container.querySelectorAll('*')).filter((element) => matchesRole(element, role)),
  ];
  return filterByRole(Array.from(new Set(elements)), role, options);
};

const roleError = (role: string, options: RoleOptions, found: number) => {
  const nameInfo = options.name
    ? ` and name ${typeof options.name === 'string' ? `"${options.name}"` : options.name}`
    : '';
  const base = found === 0 ? 'Unable to find' : 'Found multiple';
  const suffix = found === 0 ? '' : ` (${found} elements)`;
  return new Error(`${base} element${found !== 1 ? 's' : ''} with role ${role}${nameInfo}${suffix}.`);
};

const getByRole = (container: Element | Document, role: string, options: RoleOptions = {}) => {
  const results = queryAllByRole(container, role, options);
  if (results.length === 0) {
    throw roleError(role, options, 0);
  }
  if (results.length > 1) {
    throw roleError(role, options, results.length);
  }
  return results[0];
};

const queryByRole = (container: Element | Document, role: string, options: RoleOptions = {}) => {
  const results = queryAllByRole(container, role, options);
  return results[0] ?? null;
};

const waitFor = <T,>(callback: () => T, timeout = 1000, interval = 20): Promise<T> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      try {
        resolve(callback());
      } catch (error) {
        if (Date.now() - start >= timeout) {
          reject(error);
        } else {
          setTimeout(check, interval);
        }
      }
    };
    check();
  });

const findByRole = (container: Element | Document, role: string, options: RoleOptions = {}) =>
  waitFor(() => getByRole(container, role, options));

const findAllByRole = (container: Element | Document, role: string, options: RoleOptions = {}) =>
  waitFor(() => {
    const results = queryAllByRole(container, role, options);
    if (!results.length) {
      throw roleError(role, options, 0);
    }
    return results;
  });

export const screen = {
  getByRole: (role: string, options?: RoleOptions) => getByRole(document.body, role, options),
  queryByRole: (role: string, options?: RoleOptions) => queryByRole(document.body, role, options),
  findByRole: (role: string, options?: RoleOptions) => findByRole(document.body, role, options),
  findAllByRole: (role: string, options?: RoleOptions) => findAllByRole(document.body, role, options),
};

export type RenderResult = ReturnType<typeof render>;
