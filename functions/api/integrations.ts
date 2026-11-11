// Informa quais integrações estão configuradas — apenas booleanos, nunca valores.
import type { IntegrationStatus } from '../../src/core/types';
import { type Env, json } from '../../server/http';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const status: IntegrationStatus = {
    osm: { configured: true, note: 'Gratuito; cobertura variável no Brasil.' },
    googlePlaces: { configured: !!env.GOOGLE_PLACES_API_KEY },
    pagespeed: { configured: !!env.PAGESPEED_API_KEY },
    vaultSites: { configured: !!(env.VAULT_SITES_ENDPOINT && env.VAULT_SITES_TOKEN) },
    accessToken: { required: !!env.APP_ACCESS_TOKEN?.trim() },
  };
  return json(status);
};
