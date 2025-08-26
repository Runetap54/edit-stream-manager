import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logClientError } from '@/lib/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  correlationId?: string;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      correlationId: crypto.randomUUID(),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log the error
    logClientError(error, {
      route: window.location.pathname,
      action: 'react_error_boundary',
    });

    console.error('React Error Boundary caught an error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-destructive">
                <AlertTriangle className="w-6 h-6" />
                <span>Something went wrong</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                The application encountered an unexpected error. Our team has been notified.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button onClick={this.handleReload} className="flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4" />
                  <span>Reload Page</span>
                </Button>
                <Button variant="outline" onClick={this.handleReset}>
                  Try Again
                </Button>
              </div>

              {this.state.correlationId && (
                <div className="pt-4 border-t border-border">
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Technical Details
                    </summary>
                    <div className="mt-2 p-3 bg-muted rounded-md">
                      <p><strong>Correlation ID:</strong> {this.state.correlationId}</p>
                      {this.state.error && (
                        <p><strong>Error:</strong> {this.state.error.message}</p>
                      )}
                      {this.state.errorInfo && (
                        <details className="mt-2">
                          <summary className="cursor-pointer">Stack Trace</summary>
                          <pre className="mt-1 text-xs overflow-auto max-h-40">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </details>
                      )}
                    </div>
                  </details>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;