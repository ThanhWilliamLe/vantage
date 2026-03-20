export type AICategory = 'bugfix' | 'feature' | 'refactor' | 'config' | 'docs' | 'test' | 'other';
export type AIRiskLevel = 'low' | 'medium' | 'high';
export type FindingSeverity = 'high' | 'medium' | 'low' | 'info';
export type FindingCategory = 'bug' | 'security' | 'quality' | 'performance' | 'style';

export const AI_CATEGORIES: readonly AICategory[] = ['bugfix', 'feature', 'refactor', 'config', 'docs', 'test', 'other'] as const;
export const AI_RISK_LEVELS: readonly AIRiskLevel[] = ['low', 'medium', 'high'] as const;
export const FINDING_SEVERITIES: readonly FindingSeverity[] = ['high', 'medium', 'low', 'info'] as const;
export const FINDING_CATEGORIES: readonly FindingCategory[] = ['bug', 'security', 'quality', 'performance', 'style'] as const;
