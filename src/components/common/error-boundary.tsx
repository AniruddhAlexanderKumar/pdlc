"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { logger } from "@/lib/logger";

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Custom fallback renderer; receives the caught error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Generic React error boundary for isolating a section of the UI (a panel,
 * a table, a route segment) so one failure doesn't blank the whole page.
 * For route-level boundaries, prefer Next.js's file-based `error.tsx`
 * convention, which composes with this component when a finer-grained
 * boundary is needed inside a single page.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error("Unhandled UI error caught by ErrorBoundary", {
      err: error,
      componentStack: info.componentStack,
    });
  }

  private reset = (): void => this.setState({ error: null });

  override render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <Card className="border-destructive/30">
        <CardHeader className="flex-row items-start gap-3 space-y-0">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <CardTitle>Something went wrong</CardTitle>
            <CardDescription>{error.message || "An unexpected error occurred."}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={this.reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }
}

export { ErrorBoundary };
