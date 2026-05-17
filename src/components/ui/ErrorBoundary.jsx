import { Component } from "react";
import { exportLogBuffer } from "../../services/logger";
import { downloadFile } from "../../utils/download";
import Button from "./Button";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleDownloadLog = this.handleDownloadLog.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  handleDownloadLog() {
    const json = exportLogBuffer();
    const fileName = `notar-log-${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile({ fileName, content: json, mimeType: "application/json" });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] p-6">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-[var(--danger-line)] bg-[var(--surface-elevated)] p-6">
            <h1 className="text-xl font-semibold text-[var(--text-main)]">
              Algo deu errado
            </h1>
            <p className="text-sm text-[var(--text-soft)]">
              {this.state.error?.message ||
                "Ocorreu um erro inesperado. Tente recarregar a página."}
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => window.location.reload()}>
                Recarregar
              </Button>
              <Button variant="subtle" onClick={this.handleDownloadLog}>
                Baixar log de erros
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
