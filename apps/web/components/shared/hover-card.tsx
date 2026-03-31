"use client";

import {
  autoUpdate,
  FloatingPortal,
  safePolygon,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from "@floating-ui/react";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import { buildFloatingMiddleware, mergeRefs } from "@/components/shared/floating-layer";
import { cn, ui } from "@/lib/ui";

type FloatingRootRenderState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

type HoverCardContextValue = FloatingRootRenderState & {
  floatingStyles: CSSProperties;
  refs: ReturnType<typeof useFloating>["refs"];
  getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
  getReferenceProps: ReturnType<typeof useInteractions>["getReferenceProps"];
};

const HoverCardContext = createContext<HoverCardContextValue | null>(null);

function useHoverCardContext() {
  const context = useContext(HoverCardContext);

  if (!context) {
    throw new Error("HoverCard components must be used within <HoverCard>.");
  }

  return context;
}

export function HoverCard({
  children,
  placement = "bottom",
  sideOffset = 10,
  collisionPadding = 12,
  maxHeight = 320,
}: {
  children: ReactNode | ((state: FloatingRootRenderState) => ReactNode);
  placement?: Placement;
  sideOffset?: number;
  collisionPadding?: number;
  maxHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    strategy: "fixed",
    middleware: buildFloatingMiddleware({
      sideOffset,
      collisionPadding,
      maxHeight,
    }),
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    move: false,
    handleClose: safePolygon(),
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);
  const value = useMemo<HoverCardContextValue>(
    () => ({
      open,
      setOpen,
      refs,
      floatingStyles,
      getReferenceProps,
      getFloatingProps,
    }),
    [floatingStyles, getFloatingProps, getReferenceProps, open, refs],
  );

  return (
    <HoverCardContext.Provider value={value}>
      {typeof children === "function" ? children({ open, setOpen }) : children}
    </HoverCardContext.Provider>
  );
}

export function HoverCardTrigger({
  children,
  asChild = false,
}: {
  children: ReactNode;
  asChild?: boolean;
}) {
  const context = useHoverCardContext();

  if (asChild) {
    const child = Children.only(children);

    if (!isValidElement(child)) {
      throw new Error("<HoverCardTrigger asChild> expects a single React element child.");
    }

    const element = child as ReactElement<{
      "data-state"?: string;
      className?: string;
      ref?: Ref<HTMLElement>;
    }>;
    const referenceProps = context.getReferenceProps(
      element.props as HTMLAttributes<HTMLElement>,
    );

    return cloneElement(element, {
      ...referenceProps,
      "data-state": context.open ? "open" : "closed",
      ref: mergeRefs(
        (element as ReactElement & { ref?: Ref<HTMLElement> }).ref,
        context.refs.setReference,
      ),
    });
  }

  return (
    <button
      ref={context.refs.setReference}
      type="button"
      data-state={context.open ? "open" : "closed"}
      {...context.getReferenceProps()}
    >
      {children}
    </button>
  );
}

export function HoverCardContent({
  children,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const context = useHoverCardContext();

  if (!context.open) {
    return null;
  }

  return (
    <FloatingPortal>
      <div
        ref={context.refs.setFloating}
        style={{ ...context.floatingStyles, ...style }}
        className={cn(ui.popover, className)}
        {...context.getFloatingProps(props)}
      >
        {children}
      </div>
    </FloatingPortal>
  );
}
