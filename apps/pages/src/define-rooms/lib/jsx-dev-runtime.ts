import { Fragment, jsx, jsxs } from './jsx-runtime';
import type { Child } from './jsx-runtime';

type Props = Record<string, unknown> & { children?: Child };

type ComponentType = Parameters<typeof jsx>[0];

type JsxDevParams = [
  type: ComponentType,
  props: Props,
  key?: string,
  isStaticChildren?: boolean,
  source?: unknown,
  self?: unknown,
];

export { Fragment, jsx, jsxs };

export function jsxDEV(...args: JsxDevParams): ReturnType<typeof jsx> {
  const [type, props] = args;
  return jsx(type, props);
}
