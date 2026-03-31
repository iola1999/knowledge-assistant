"use client";

import {
  flip,
  offset,
  shift,
  size,
  type Middleware,
} from "@floating-ui/react";
import { type Ref } from "react";

export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) {
      if (!ref) {
        continue;
      }

      if (typeof ref === "function") {
        ref(value);
        continue;
      }

      try {
        (ref as { current: T | null }).current = value;
      } catch {
        // noop
      }
    }
  };
}

export function buildFloatingMiddleware({
  sideOffset = 10,
  collisionPadding = 12,
  maxHeight,
}: {
  sideOffset?: number;
  collisionPadding?: number;
  maxHeight?: number;
}) {
  const middleware: Middleware[] = [
    offset(sideOffset),
    flip({ padding: collisionPadding }),
    shift({ padding: collisionPadding }),
  ];

  if (typeof maxHeight === "number") {
    middleware.push(
      size({
        padding: collisionPadding,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(
            0,
            Math.min(availableHeight, maxHeight),
          )}px`;
        },
      }),
    );
  }

  return middleware;
}
