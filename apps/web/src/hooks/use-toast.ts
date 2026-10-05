// Inspired by react-hot-toast library
import * as React from "react";

import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1_000_000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
} as const;

let count = 0;

const genId = () => {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
};

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType["ADD_TOAST"];
      toast: ToasterToast;
    }
  | {
      type: ActionType["UPDATE_TOAST"];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType["DISMISS_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | {
      type: ActionType["REMOVE_TOAST"];
      toastId?: ToasterToast["id"];
    };

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      toastId,
      type: "REMOVE_TOAST",
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

const addToast = (state: State, toast: ToasterToast): State => ({
  ...state,
  toasts: [toast, ...state.toasts].slice(0, TOAST_LIMIT),
});

const updateToast = (state: State, toast: Partial<ToasterToast>): State => ({
  ...state,
  toasts: state.toasts.map((currentToast) =>
    currentToast.id === toast.id ? { ...currentToast, ...toast } : currentToast
  ),
});

const dismissToasts = (state: State, toastId?: string): State => {
  if (toastId) {
    addToRemoveQueue(toastId);
  } else {
    for (const toastItem of state.toasts) {
      addToRemoveQueue(toastItem.id);
    }
  }

  return {
    ...state,
    toasts: state.toasts.map((toast) =>
      toast.id === toastId || toastId === undefined
        ? {
            ...toast,
            open: false,
          }
        : toast
    ),
  };
};

const removeToast = (state: State, toastId?: string): State => {
  if (toastId === undefined) {
    return {
      ...state,
      toasts: [],
    };
  }

  return {
    ...state,
    toasts: state.toasts.filter((toast) => toast.id !== toastId),
  };
};

const listeners: ((state: State) => void)[] = [];

let memoryState: State = { toasts: [] };

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST": {
      return addToast(state, action.toast);
    }

    case "UPDATE_TOAST": {
      return updateToast(state, action.toast);
    }

    case "DISMISS_TOAST": {
      return dismissToasts(state, action.toastId);
    }
    case "REMOVE_TOAST": {
      return removeToast(state, action.toastId);
    }
    default: {
      return state;
    }
  }
};

const dispatch = (action: Action) => {
  memoryState = reducer(memoryState, action);
  for (const listener of listeners) {
    listener(memoryState);
  }
};

type Toast = Omit<ToasterToast, "id">;

const toast = ({ ...toastProps }: Toast) => {
  const id = genId();

  const update = (nextToast: ToasterToast) =>
    dispatch({
      toast: { ...nextToast, id },
      type: "UPDATE_TOAST",
    });
  const dismiss = () => dispatch({ toastId: id, type: "DISMISS_TOAST" });

  dispatch({
    toast: {
      ...toastProps,
      id,
      onOpenChange: (open) => {
        if (!open) {
          dismiss();
        }
      },
      open: true,
    },
    type: "ADD_TOAST",
  });

  return {
    dismiss,
    id,
    update,
  };
};

const useToast = () => {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return {
    ...state,
    dismiss: (toastId?: string) => dispatch({ toastId, type: "DISMISS_TOAST" }),
    toast,
  };
};

export { useToast, toast };
