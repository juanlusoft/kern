import {

  createDeterministicId,

  createEvidenceRecord,

  fingerprintCapabilityInput,

  fingerprintCapabilityInvocation,

  fingerprintCoreRequest,

  normalizeCorrelationId,

  normalizeResourceQuery,

  type CapabilityDefinition,

  type CapabilityInvocationRequest,

  type CapabilityInvocationResult,

  type CoreRequest,

  type ExternalReadAdapter,

  type GovernedWorkflowRequest,

  type GovernedWorkflowResult,

  type GovernedWorkflowResponse,

  type GovernedWorkflowKind,

  type MockEmailSendWorkflowInput,

  type MockReadEstimateWorkflowInput,

  type PrincipalType,

  type ResourceQuery,

  type ResourceResult,

  type WorkflowEvidenceTrace,

  type WorkflowExecutionStatus,

  type WorkflowStep

} from '../../contracts/src/index';

import { InMemoryDecisionBindingStore } from '../../bindings/src/index';

import { InMemoryCapabilityRuntime, createMockResourceReadCapability } from '../../capabilities/src/index';

import { InMemoryEvidenceLedger } from '../../evidence/src/index';

import { resolveIdentityContext, resolveOrganizationContext } from '../../identity/src/index';

import { evaluatePolicy } from '../../policy/src/index';

import { InMemoryTurnRuntime } from '../../turns/src/index';

import { createMockExternalReadAdapter } from '../../external-read-adapters/src/index';
import { type PacoPrintCatalogAdapterPort } from '../../contracts/src/index';



export function createMockEstimateReadCapability(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {

  return {

    capability_id: 'mock.estimate.read',

    organization_id: 'org-acme',

    title: 'Mock estimate read',

    description: 'Read an estimate from the governed mock runtime.',

    kind: 'read_only',

    version: '1.0.0',

    enabled: true,

    approval_requirement: {

      required: false,

      reason: 'read only',

      binding_required: false

    },

    mock: {

      invoke(input) {

        const estimate_id = String(input.input.payload.estimate_id ?? '');

        if (estimate_id === 'estimate-missing') {

          return { status: 'not_found', output: null, error: 'estimate missing' };

        }

        if (estimate_id === 'estimate-offline') {

          return { status: 'unavailable', output: null, error: 'estimate service unavailable' };

        }

        if (estimate_id === 'estimate-error') {

          return { status: 'error', output: null, error: 'estimate service error' };

        }

        return {

          status: 'executed',

          output: {

            capability_id: input.capability_id,

            status: 'executed',

            result: {

              estimate_id,

              customer_name: input.input.payload.customer_id ? 'Acme Customer' : 'Acme Customer',

              description: 'Quarterly estimate mock',

              base_amount: 1000,

              tax_amount: 210,

              total_amount: 1210,

              currency: 'EUR',

              source: 'mock_runtime'

            },

            processed_at: '2026-06-29T00:00:00.000Z'

          },

          error: null

        };

      }

    },

    ...overrides

  };

}



export function createMockEmailPreviewCapability(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {

  return {

    capability_id: 'mock.email.preview',

    organization_id: 'org-acme',

    title: 'Mock email preview',

    description: 'Preview an email without sending it.',

    kind: 'read_only',

    version: '1.0.0',

    enabled: true,

    approval_requirement: {

      required: false,

      reason: 'preview only',

      binding_required: false

    },

    mock: {

      invoke(input) {

        const body = String(input.input.payload.body ?? '');

        return {

          status: 'executed',

          output: {

            capability_id: input.capability_id,

            status: 'executed',

            result: {

              to: String(input.input.payload.to ?? ''),

              subject: String(input.input.payload.subject ?? ''),

              body_fingerprint: fingerprintCapabilityInput(input.input),

              preview_fingerprint: fingerprintCapabilityInvocation(input),

              source: 'mock_runtime'

            },

            processed_at: '2026-06-29T00:00:00.000Z'

          },

          error: null

        };

      }

    },

    ...overrides

  };

}



export function createMockEmailSendCapability(overrides: Partial<CapabilityDefinition> = {}): CapabilityDefinition {

  return {

    capability_id: 'mock.email.send',

    organization_id: 'org-acme',

    title: 'Mock email send',

    description: 'Send a governed email through the mock runtime.',

    kind: 'effectful',

    version: '1.0.0',

    enabled: true,

    approval_requirement: {

      required: true,

      reason: 'binding required',

      binding_required: true

    },

    mock: {

      invoke(input) {

        return {

          status: 'executed',

          output: {

            capability_id: input.capability_id,

            status: 'executed',

            result: {

              mock_message_id: createDeterministicId('mock-message', {

                to: input.input.payload.to,

                subject: input.input.payload.subject,

                body_fingerprint: fingerprintCapabilityInput(input.input),

                binding_id: input.decision_binding_id ?? input.binding_id ?? null

              }),

              to: String(input.input.payload.to ?? ''),

              subject: String(input.input.payload.subject ?? ''),

              body_fingerprint: fingerprintCapabilityInput(input.input),

              sent: true,

              source: 'mock_runtime'

            },

            processed_at: '2026-06-29T00:00:00.000Z'

          },

          error: null

        };

      }

    },

    ...overrides

  };

}

function buildPricingCapabilityResult(input: CapabilityInvocationRequest, resourceResult: ResourceResult) {
  const reason = resourceResult.error ?? resourceResult.decision.reason;
  switch (resourceResult.status) {
    case 'found':
      return {
        status: 'executed' as const,
        output: {
          capability_id: input.capability_id,
          status: 'executed' as const,
          result: resourceResult as unknown as Record<string, unknown>,
          processed_at: resourceResult.created_at
        },
        error: null
      };
    case 'not_found':
      return { status: 'not_found' as const, output: null, error: reason };
    case 'unavailable':
      return { status: 'unavailable' as const, output: null, error: reason };
    case 'error':
      return { status: 'error' as const, output: null, error: reason };
    case 'denied':
    case 'blocked':
      return { status: 'denied' as const, output: null, error: reason };
  }
}

export function createPricingQuoteLineCapability(
  adapter: PacoPrintCatalogAdapterPort,
  overrides: Partial<CapabilityDefinition> = {},
  organization_id = 'org-pacoprint'
): CapabilityDefinition {
  return {
    capability_id: 'pricing.quote_line',
    organization_id,
    title: 'PacoPrint pricing quote line',
    description: 'Calculate a single governed PacoPrint line price.',
    kind: 'read_only',
    version: '1.0.0',
    enabled: true,
    approval_requirement: {
      required: false,
      reason: 'read only',
      binding_required: false
    },
    mock: {
      invoke(input) {
        const payload = input.input.payload as Record<string, unknown>;
        const articulo_id = payload.articulo_id;
        const unidades = payload.unidades;
        const alto = payload.alto;
        const ancho = payload.ancho;
        const atributos = payload.atributos;
        if (
          (typeof articulo_id !== 'string' && typeof articulo_id !== 'number') ||
          typeof unidades !== 'number' ||
          typeof alto !== 'number' ||
          typeof ancho !== 'number' ||
          atributos === null ||
          typeof atributos !== 'object' || Array.isArray(atributos)
        ) {
          return { status: 'denied' as const, output: null, error: 'pricing payload invalid' };
        }
        const resourceResult = adapter.quoteLine({
          articulo_id,
          unidades,
          alto,
          ancho,
          atributos,
          organization_id: input.organization_id,
          correlation_id: input.correlation_id
        });
        return buildPricingCapabilityResult(input, resourceResult);
      }
    },
    ...overrides
  };
}
