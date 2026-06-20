// Arize Phoenix OpenTelemetry tracing — stub for future wiring
// To activate: set ARIZE_API_KEY and call initTracing() before app startup

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
// SimpleSpanProcessor imported when exporter is wired up
// import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { trace } from '@opentelemetry/api'

let initialized = false

export function initTracing() {
  if (initialized || !process.env.ARIZE_API_KEY) return

  const provider = new NodeTracerProvider()

  // TODO: add ArizePhoenixExporter here when arize-phoenix-otel package stabilizes
  // const exporter = new ArizePhoenixExporter({ apiKey: process.env.ARIZE_API_KEY })
  // provider.addSpanProcessor(new SimpleSpanProcessor(exporter))

  provider.register()
  initialized = true
}

export function getTracer(name: string) {
  return trace.getTracer(name)
}
