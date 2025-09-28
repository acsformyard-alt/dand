function normalizeChildren(children) {
    const output = [];
    const append = (value) => {
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
    }
    else if (children !== undefined) {
        append(children);
    }
    return output;
}
function applyProps(element, props) {
    Object.entries(props).forEach(([key, value]) => {
        if (key === "children" || value === undefined || value === null) {
            return;
        }
        if (key === "ref" && typeof value === "function") {
            value(element);
            return;
        }
        if (key.startsWith("on") && typeof value === "function") {
            const eventName = key.substring(2).toLowerCase();
            element.addEventListener(eventName, value);
            return;
        }
        if (key === "style" && typeof value === "object") {
            Object.assign(element.style, value);
            return;
        }
        if (key in element) {
            try {
                element[key] = value;
                return;
            }
            catch (error) {
                // Fallback to attribute assignment if direct property fails.
            }
        }
        element.setAttribute(key, String(value));
    });
}
export function jsx(type, props = {}) {
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
export const Fragment = (props = {}) => {
    const fragment = document.createDocumentFragment();
    normalizeChildren(props.children).forEach((child) => fragment.appendChild(child));
    return fragment;
};
