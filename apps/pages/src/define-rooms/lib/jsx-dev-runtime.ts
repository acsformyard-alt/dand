import { Fragment, jsx, jsxs } from './jsx-runtime';

export { Fragment, jsx, jsxs };

export function jsxDEV(
  type: Parameters<typeof jsx>[0],
  props: Parameters<typeof jsx>[1],
  key?: string,
  isStaticChildren?: boolean,
  source?: unknown,
  self?: unknown,
) {
  return jsx(type, props);
}
