import type { PolicyRequest, PolicyResponse, PolicyRule } from './types';
import { DEFAULT_RULES } from './rules';

// ─── Policy Engine ────────────────────────────────────────────────────────────

export class PolicyEngine {
  private readonly rules: PolicyRule[];

  constructor(rules: PolicyRule[] = DEFAULT_RULES) {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
  }

  evaluate(request: PolicyRequest): PolicyResponse {
    for (const rule of this.rules) {
      if (this.matches(rule, request)) {
        return {
          requestId: request.requestId,
          decision: rule.decision,
          riskLevel: rule.riskLevel,
          reason: rule.reason,
          matchedRuleId: rule.ruleId,
          requiresApprovalFrom:
            rule.decision === 'require_human_approval' ? 'project-owner' : undefined,
        };
      }
    }

    // Fallback — should never reach here because DEFAULT_DENY is always last
    return {
      requestId: request.requestId,
      decision: 'deny',
      riskLevel: 'critical',
      reason: 'No matching policy rule found. Denied by safety fallback.',
    };
  }

  private matches(rule: PolicyRule, request: PolicyRequest): boolean {
    const { condition } = rule;

    if (condition.agents && !condition.agents.includes(request.agentId)) {
      return false;
    }
    if (condition.tools && !condition.tools.includes(request.toolName)) {
      return false;
    }
    if (condition.environments && !condition.environments.includes(request.environment)) {
      return false;
    }
    if (condition.inputMatchers) {
      for (const matcher of condition.inputMatchers) {
        if (!this.matchInput(matcher, request.toolInput)) return false;
      }
    }

    return true;
  }

  private matchInput(
    matcher: { field: string; operator: string; value: string },
    input: Record<string, unknown>
  ): boolean {
    const fieldValue = this.getNestedValue(input, matcher.field);
    if (typeof fieldValue !== 'string') return false;

    switch (matcher.operator) {
      case 'equals':
        return fieldValue === matcher.value;
      case 'contains':
        return fieldValue.toLowerCase().includes(matcher.value.toLowerCase());
      case 'startsWith':
        return fieldValue.startsWith(matcher.value);
      case 'matches':
        return new RegExp(matcher.value).test(fieldValue);
      default:
        return false;
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const policyEngine = new PolicyEngine();
