package telemetry

import (
	"context"
	"log"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
)

// InitTelemetry initializes OpenTelemetry distributed tracing if OTEL_EXPORTER_OTLP_ENDPOINT is configured.
// Returns a shutdown cleanup function.
func InitTelemetry(ctx context.Context) (func(), error) {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		// OTel stays 100% dormant with zero overhead if no endpoint is configured
		return func() {}, nil
	}

	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "dbmux"
	}

	token := os.Getenv("OTEL_EXPORTER_OTLP_TOKEN")
	if token == "" {
		token = os.Getenv("OTEL_TOKEN")
	}

	var httpOpts []otlptracehttp.Option
	httpOpts = append(httpOpts, otlptracehttp.WithEndpoint(endpoint), otlptracehttp.WithInsecure())
	if token != "" {
		httpOpts = append(httpOpts, otlptracehttp.WithHeaders(map[string]string{
			"Authorization": "Bearer " + token,
		}))
	}

	exporter, err := otlptracehttp.New(ctx, httpOpts...)
	if err != nil {
		log.Printf("[OTel] Failed to initialize OTLP HTTP trace exporter: %v", err)
		return func() {}, err
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(serviceName),
		),
	)
	if err != nil {
		log.Printf("[OTel] Failed to create resource: %v", err)
		return func() {}, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter), // Async batch exporter (zero request blocking)
		sdktrace.WithResource(res),
	)

	otel.SetTracerProvider(tp)
	log.Printf("[OTel] OpenTelemetry distributed tracing initialized (Service: %s, Endpoint: %s)", serviceName, endpoint)

	shutdown := func() {
		if err := tp.Shutdown(context.Background()); err != nil {
			log.Printf("[OTel] Error shutting down TracerProvider: %v", err)
		}
	}

	return shutdown, nil
}
