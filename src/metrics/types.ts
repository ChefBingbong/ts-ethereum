/**
 * Type Definitions for Metrics
 *
 * Replaces lodestar utils types with custom implementations
 */

import type { Counter, Gauge, Histogram, Registry } from "prom-client";

/**
 * Generic label type - can be any object with string keys and string values
 */
export type LabelsGeneric = Record<string, string | number>;

/**
 * No labels type - empty object
 */
export type NoLabels = Record<string, never>;

/**
 * Extract label keys from a labels type
 */
export type LabelKeys<Labels extends LabelsGeneric> = Array<keyof Labels>;

/**
 * Collect function type for gauges
 */
export type CollectFn<Labels extends LabelsGeneric> = (
	metric: IGauge<Labels>,
) => void;

/**
 * Gauge configuration
 */
export interface GaugeConfig<Labels extends LabelsGeneric = NoLabels> {
	name: string;
	help: string;
	labelNames?: LabelKeys<Labels>;
	registers?: Array<Registry>;
}

/**
 * Histogram configuration
 */
export interface HistogramConfig<Labels extends LabelsGeneric = NoLabels> {
	name: string;
	help: string;
	labelNames?: LabelKeys<Labels>;
	buckets?: number[];
	registers?: Array<Registry>;
}

/**
 * Counter configuration
 */
export interface CounterConfig<Labels extends LabelsGeneric = NoLabels> {
	name: string;
	help: string;
	labelNames?: LabelKeys<Labels>;
	registers?: Array<Registry>;
}

/**
 * AvgMinMax configuration
 */
export interface AvgMinMaxConfig<Labels extends LabelsGeneric = NoLabels> {
	name: string;
	help: string;
	labelNames?: LabelKeys<Labels>;
	registers?: Array<Registry>;
}

/**
 * Static metric configuration
 */
export interface StaticConfig<Labels extends LabelsGeneric = NoLabels> {
	name: string;
	help: string;
	value: Labels;
}

/**
 * Gauge interface
 */
export interface IGauge<Labels extends LabelsGeneric = NoLabels> {
	set(value: number): void;
	set(labels: Labels, value: number): void;
	inc(value?: number): void;
	inc(labels: Labels, value?: number): void;
	dec(value?: number): void;
	dec(labels: Labels, value?: number): void;
}

/**
 * Histogram interface
 */
export interface IHistogram<Labels extends LabelsGeneric = NoLabels> {
	observe(value: number): void;
	observe(labels: Labels, value: number): void;
	startTimer(): (labels?: Labels) => void;
	startTimer(labels: Labels): () => void;
}

/**
 * Counter interface
 */
export interface ICounter<Labels extends LabelsGeneric = NoLabels> {
	inc(value?: number): void;
	inc(labels: Labels, value?: number): void;
}

/**
 * AvgMinMax interface
 */
export interface IAvgMinMax<Labels extends LabelsGeneric = NoLabels> {
	set(values: number[]): void;
	set(labels: Labels, values: number[]): void;
	addGetValuesFn(getValuesFn: () => number[]): void;
}

/**
 * Extended Gauge interface with collect functionality
 */
export interface IGaugeExtra<Labels extends LabelsGeneric = NoLabels>
	extends IGauge<Labels> {
	addCollect(collectFn: CollectFn<Labels>): void;
}

/**
 * Registry interface for custom metric creation
 */
export interface MetricsRegisterCustom {
	gauge<Labels extends LabelsGeneric = NoLabels>(
		configuration: GaugeConfig<Labels>,
	): IGaugeExtra<Labels>;
	histogram<Labels extends LabelsGeneric = NoLabels>(
		configuration: HistogramConfig<Labels>,
	): IHistogram<Labels>;
	counter<Labels extends LabelsGeneric = NoLabels>(
		configuration: CounterConfig<Labels>,
	): ICounter<Labels>;
	avgMinMax<Labels extends LabelsGeneric = NoLabels>(
		configuration: AvgMinMaxConfig<Labels>,
	): IAvgMinMax<Labels>;
	static<Labels extends LabelsGeneric = NoLabels>(
		configuration: StaticConfig<Labels>,
	): void;
}
