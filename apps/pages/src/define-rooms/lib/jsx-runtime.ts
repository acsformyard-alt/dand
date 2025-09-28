export type Child = Node | string | number | boolean | null | undefined | Child[];

type Props = Record<string, unknown> & { children?: Child };

function normalizeChildren(children: Child | Child[] | undefined): Node[] {
  const output: Node[] = [];
  const append = (value: Child): void => {
    if (value === null || value === undefined || value === false) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(append);
      return;
    }
    if (value instanceof Node) {
      output.push(value);
      return;
    }
    output.push(document.createTextNode(String(value)));
  };

  if (Array.isArray(children)) {
    children.forEach(append);
  } else if (children !== undefined) {
    append(children);
  }

  return output;
}

function applyProps(element: HTMLElement, props: Props): void {
  Object.entries(props).forEach(([key, value]) => {
    if (key === "children" || value === undefined || value === null) {
      return;
    }

    if (key === "ref" && typeof value === "function") {
      (value as (node: HTMLElement) => void)(element);
      return;
    }

    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key.substring(2).toLowerCase();
      element.addEventListener(eventName, value as EventListener);
      return;
    }

    if (key === "style" && typeof value === "object") {
      Object.assign(element.style, value as Record<string, string>);
      return;
    }

    if (key in element) {
      try {
        (element as unknown as Record<string, unknown>)[key] = value;
        return;
      } catch (error) {
        // Fallback to attribute assignment if direct property fails.
      }
    }

    element.setAttribute(key, String(value));
  });
}

type FunctionalComponent = (props: Props) => Node;

export function jsx(type: string | FunctionalComponent, props: Props = {}): Node {
  if (typeof type === "function") {
    return type(props);
  }

  const element = document.createElement(type);
  const children = normalizeChildren(props.children);
  applyProps(element, props);
  element.append(...children);
  return element;
}

export const jsxs = jsx;

export const Fragment = (props: Props = {}): DocumentFragment => {
  const fragment = document.createDocumentFragment();
  normalizeChildren(props.children).forEach((child) => fragment.appendChild(child));
  return fragment;
};
