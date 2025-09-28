import { jsx, jsxs, Fragment } from './jsx-runtime';

type JsxType = Parameters<typeof jsx>[0];
type JsxProps = Parameters<typeof jsx>[1];

type JsxDevReturn = ReturnType<typeof jsx>;

type JsxDevParameters = [
  type: JsxType,
  props?: JsxProps,
  key?: string,
  isStaticChildren?: boolean,
  source?: unknown,
  self?: unknown,
];

export { Fragment, jsx, jsxs };

export function jsxDEV(...args: JsxDevParameters): JsxDevReturn {
  const [type, props] = args;
  return jsx(type, props ?? {});
}
