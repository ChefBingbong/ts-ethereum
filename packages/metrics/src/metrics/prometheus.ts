import { RegistryMetricCreator } from '../utils/registryMetricCreator'

export const createPrometheusMetrics = (register: RegistryMetricCreator) => {
  return {
    legacyTxGauge: register.gauge({
      name: 'legacy_transactions_in_transaction_pool',
      help: 'Number of legacy transactions in the client transaction pool',
    }),
  }
}
