export function render(node: Node, container: HTMLElement): void {
  container.innerHTML = "";
  container.appendChild(node);
}
