/**
 * MCP tool handlers for the standalone PromptUp plugin.
 *
 * Three tools:
 *   - evaluate_session  — evaluate a coding session across 11 skill dimensions
 *   - generate_pr_report — generate a DQS report for a git branch
 *   - get_status         — show tracking status and recent activity
 *
 * STANDALONE — no imports from @promptup/shared or workspace packages.
 */
interface ToolResponse {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}
export declare function handleEvaluateSession(args: {
    session_id?: string;
}): Promise<ToolResponse>;
export declare function handleGeneratePRReport(args: {
    branch?: string;
    post?: boolean;
}): Promise<ToolResponse>;
export declare function handleGetStatus(_args: {}): Promise<ToolResponse>;
export declare function handleConfigure(args: {
    get?: string;
    set?: Record<string, unknown>;
}): Promise<ToolResponse>;
export {};
