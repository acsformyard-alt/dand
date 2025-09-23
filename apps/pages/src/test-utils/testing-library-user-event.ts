const pointerEventCtor: typeof PointerEvent | typeof MouseEvent =
  typeof PointerEvent === 'function' ? PointerEvent : (MouseEvent as unknown as typeof PointerEvent);
const mouseEventCtor = typeof MouseEvent === 'function' ? MouseEvent : Event;
const inputEventCtor = typeof InputEvent === 'function' ? InputEvent : (Event as unknown as typeof InputEvent);

const dispatch = (target: EventTarget, event: Event) => target.dispatchEvent(event);

const createPointerEvent = (type: string, init: PointerEventInit = {}) =>
  new pointerEventCtor(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? 'mouse',
    ...init,
  });

const createMouseEvent = (type: string, init: MouseEventInit = {}) =>
  new mouseEventCtor(type, { bubbles: true, cancelable: true, ...init });

const fireInputEvent = (element: HTMLInputElement | HTMLTextAreaElement, value: string, data: string) => {
  element.value = value;
  dispatch(
    element,
    new inputEventCtor('input', {
      data,
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
    } as InputEventInit)
  );
};

class UserEventController {
  async click(element: Element, init: MouseEventInit = {}) {
    dispatch(element, createPointerEvent('pointerdown', { pointerType: 'mouse' }));
    dispatch(element, createPointerEvent('pointerup', { pointerType: 'mouse' }));
    dispatch(element, createMouseEvent('click', init));
  }

  async dblClick(element: Element, init: MouseEventInit = {}) {
    await this.click(element, init);
    await this.click(element, init);
    dispatch(element, createMouseEvent('dblclick', init));
  }

  async type(element: Element, text: string) {
    const target = element as HTMLInputElement | HTMLTextAreaElement;
    for (const char of text) {
      fireInputEvent(target, `${target.value}${char}`, char);
    }
  }

  async clear(element: Element) {
    const target = element as HTMLInputElement | HTMLTextAreaElement;
    fireInputEvent(target, '', '');
  }
}

const userEvent = {
  setup() {
    return new UserEventController();
  },
};

export default userEvent;
