import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Registry } from "prom-client";
import { RegistryMetricCreator } from "../utils/registryMetricCreator.js";

export type HttpMetricsServerOpts = {
	port: number;
	address?: string;
};

export type HttpMetricsServer = {
	close(): Promise<void>;
};

enum RequestStatus {
	success = "success",
	error = "error",
}

/**
 * Simple error wrapper utility
 */
async function wrapError<T>(
	promise: Promise<T>,
): Promise<{ err?: Error; result?: T }> {
	try {
		const result = await promise;
		return { result };
	} catch (err) {
		return { err: err instanceof Error ? err : new Error(String(err)) };
	}
}

/**
 * Simple socket tracker for metrics server
 */
class SimpleSocketTracker {
	private sockets = new Set<http.ServerResponse>();
	private metrics: {
		activeSockets: ReturnType<RegistryMetricCreator["gauge"]>;
		socketsBytesRead: ReturnType<RegistryMetricCreator["gauge"]>;
		socketsBytesWritten: ReturnType<RegistryMetricCreator["gauge"]>;
	};

	constructor(
		server: http.Server,
		metrics: {
			activeSockets: ReturnType<RegistryMetricCreator["gauge"]>;
			socketsBytesRead: ReturnType<RegistryMetricCreator["gauge"]>;
			socketsBytesWritten: ReturnType<RegistryMetricCreator["gauge"]>;
		},
	) {
		this.metrics = metrics;

		server.on("connection", (socket) => {
			this.sockets.add(socket as unknown as http.ServerResponse);
			this.updateMetrics();

			socket.on("close", () => {
				this.sockets.delete(socket as unknown as http.ServerResponse);
				this.updateMetrics();
			});
		});
	}

	private updateMetrics(): void {
		this.metrics.activeSockets.set(this.sockets.size);
	}

	async terminate(): Promise<void> {
		// Close all active sockets
		const closePromises = Array.from(this.sockets).map(
			(socket) =>
				new Promise<void>((resolve) => {
					if (!socket.destroyed) {
						socket.destroy();
					}
					resolve();
				}),
		);
		await Promise.all(closePromises);
		this.sockets.clear();
		this.updateMetrics();
	}
}

export async function getHttpMetricsServer(
	opts: HttpMetricsServerOpts,
	{
		register,
		getOtherMetrics = async () => [],
	}: { register: Registry; getOtherMetrics?: () => Promise<string[]> },
): Promise<HttpMetricsServer> {
	// New registry to metric the metrics. Using the same registry would deadlock the .metrics promise
	const httpServerRegister = new RegistryMetricCreator();

	const scrapeTimeMetric = httpServerRegister.histogram<{
		status: RequestStatus;
	}>({
		name: "eth_metrics_scrape_seconds",
		help: "Metrics server async time to scrape metrics",
		labelNames: ["status"],
		buckets: [0.1, 1, 10],
	});

	const server = http.createServer(async function onRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
	): Promise<void> {
		if (req.method === "GET" && req.url && req.url.includes("/metrics")) {
			const timer = scrapeTimeMetric.startTimer({
				status: RequestStatus.success,
			});
			const metricsRes = await wrapError(register.metrics());
			if (metricsRes.err) {
				// Create a new timer for error case
				const errorTimer = scrapeTimeMetric.startTimer({
					status: RequestStatus.error,
				});
				errorTimer();
			} else {
				timer();
			}

			// Ensure we only writeHead once
			if (metricsRes.err) {
				res
					.writeHead(500, { "content-type": "text/plain" })
					.end(metricsRes.err.stack);
			} else {
				// Get scrape time metrics
				const httpServerMetrics = await httpServerRegister.metrics();
				const otherMetrics = await getOtherMetrics();
				const metrics = [metricsRes.result, httpServerMetrics, ...otherMetrics];
				const metricsStr = metrics.join("\n\n");
				res
					.writeHead(200, { "content-type": register.contentType })
					.end(metricsStr);
			}
		} else {
			res.writeHead(404).end();
		}
	});

	const socketsMetrics = {
		activeSockets: httpServerRegister.gauge({
			name: "eth_metrics_server_active_sockets_count",
			help: "Metrics server current count of active sockets",
		}),
		socketsBytesRead: httpServerRegister.gauge({
			name: "eth_metrics_server_sockets_bytes_read_total",
			help: "Metrics server total count of bytes read on all sockets",
		}),
		socketsBytesWritten: httpServerRegister.gauge({
			name: "eth_metrics_server_sockets_bytes_written_total",
			help: "Metrics server total count of bytes written on all sockets",
		}),
	};

	const activeSockets = new SimpleSocketTracker(server, socketsMetrics);

	await new Promise<void>((resolve, reject) => {
		server.once("error", (err) => {
			console.error("Error starting metrics HTTP server", opts, err);
			reject(err);
		});
		server.listen(opts.port, opts.address, () => {
			const { port, address: host, family } = server.address() as AddressInfo;
			const address = `http://${family === "IPv6" ? `[${host}]` : host}:${port}`;
			console.log("Started metrics HTTP server", { address });
			resolve();
		});
	});

	return {
		async close(): Promise<void> {
			// Gracefully close all active sockets
			await activeSockets.terminate();

			await new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			});

			// Metrics HTTP server closed
		},
	};
}
