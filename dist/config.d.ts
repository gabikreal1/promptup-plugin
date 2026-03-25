/**
 * PromptUp configuration manager.
 *
 * Manages ~/.promptup/config.json with defaults.
 * First run creates the file with recommended settings.
 * Users override what they want — the file IS the documentation.
 */
export interface PromptUpConfig {
    evaluation: {
        auto_trigger: 'off' | 'prompt_count' | 'session_end';
        interval: number;
        weight_profile: 'balanced' | 'greenfield' | 'bugfix' | 'refactor' | 'security_review';
        timeout_seconds: number;
        feedback_detail: 'brief' | 'standard' | 'detailed';
    };
    dimensions: {
        enabled: string[];
        custom_weights: Record<string, number> | null;
    };
    decisions: {
        signal_filter: 'high' | 'high+medium' | 'all';
        show_routine_count: boolean;
    };
    pr_report: {
        auto_post: boolean;
        base_branch: string;
    };
    classification: {
        bands: Record<string, [number, number]>;
    };
    statusline: {
        enabled: boolean;
        show_recommendation: boolean;
    };
}
export declare const DEFAULT_CONFIG: PromptUpConfig;
export declare function loadConfig(): PromptUpConfig;
export declare function saveConfig(config: PromptUpConfig): void;
export declare function updateConfig(updates: Record<string, unknown>): PromptUpConfig;
export declare function getConfigValue(path: string): unknown;
