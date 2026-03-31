"use client";

import {
  autoUpdate,
  FloatingPortal,
  useClick,
  useDismiss,
  useFloating,
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

type PopoverContextValue = FloatingRootRenderState & {
  floatingStyles: CSSProperties;
  refs: ReturnType<typeof useFloating>["refs"];
  getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
  getReferenceProps: ReturnType<typeof useInteractions>["getReferenceProps"];
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext() {
  const context = useContext(PopoverContext);

  if (!context) {
    throw new Error("Popover components must be used within <Popover>.");
  }

  return context;
}

function useControllableOpenState(input: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(input.defaultOpen ?? false);
  const isControlled = typeof input.open === "boolean";
  const open = isControlled ? input.open! : uncontrolledOpen;

  const setOpen = (nextOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(nextOpen);
    }

    input.onOpenChange?.(nextOpen);
  };

  return {
    open,
    setOpen,
  };
}

export function Popover({
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  placement = "bottom-end",
  sideOffset = 10,
  collisionPadding = 12,
  maxHeight,
}: {
  children: ReactNode | ((state: FloatingRootRenderState) => ReactNode);
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: Placement;
  sideOffset?: number;
  collisionPadding?: number;
  maxHeight?: number;
}) {
  const { open, setOpen } = useControllableOpenState({
    open: openProp,
    defaultOpen,
    onOpenChange,
  });
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
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
    role,
  ]);
  const value = useMemo<PopoverContextValue>(
    () => ({
      open,
      setOpen,
      refs,
      floatingStyles,
      getReferenceProps,
      getFloatingProps,
    }),
    [floatingStyles, getFloatingProps, getReferenceProps, open, refs, setOpen],
  );

  return (
    <PopoverContext.Provider value={value}>
      {typeof children === "function" ? children({ open, setOpen }) : children}
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({
  children,
  asChild = false,
}: {
  children: ReactNode;
  asChild?: boolean;
}) {
  const context = usePopoverContext();

  if (asChild) {
    const child = Children.only(children);

    if (!isValidElement(child)) {
      throw new Error("<PopoverTrigger asChild> expects a single React element child.");
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

export function PopoverContent({
  children,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const context = usePopoverContext();

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
