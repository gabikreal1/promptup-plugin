/**
 * Evaluation engine for the standalone PromptUp plugin.
 *
 * Primary: spawns `claude -p` to get real LLM analysis of the session.
 * Fallback: heuristic pattern matching if Claude Code is unavailable.
 *
 * STANDALONE copy — no imports from @promptup/shared or session-watcher.
 */
import { spawn } from 'node:child_process';
import { ulid } from 'ulid';
import { BASE_DIMENSIONS, BASE_DIMENSION_KEYS, DOMAIN_DIMENSIONS, DOMAIN_DIMENSION_KEYS, WEIGHT_PROFILES, } from './shared/dimensions.js';
import { computeCompositeScore, computeDomainComposite, computeTechComposite, computeOverallComposite, computeGrandComposite, computeRiskFlagsWithHistory, } from './shared/scoring.js';
import { getLatestEvaluation, insertEvaluation, insertDecision, } from './db.js';
/**
 * Combined role + skill roadmaps catalog for tech detection.
 * Mirrors the full list from @promptup/shared/roadmaps without importing it.
 */
const ALL_ROADMAPS = {
    // Role roadmaps
    frontend: { name: 'Frontend Developer', competencies: ['component_architecture', 'css_layout', 'js_fundamentals', 'frameworks', 'state_management', 'build_tools', 'testing', 'performance', 'accessibility', 'responsive_design'] },
    backend: { name: 'Backend Developer', competencies: ['api_design', 'databases', 'authentication', 'caching', 'message_queues', 'testing', 'security', 'scaling', 'containerization', 'monitoring'] },
    devops: { name: 'DevOps Engineer', competencies: ['ci_cd', 'containerization', 'orchestration', 'iac', 'monitoring', 'cloud_platforms', 'networking', 'scripting', 'security', 'logging'] },
    fullstack: { name: 'Full Stack Developer', competencies: ['frontend_frameworks', 'backend_frameworks', 'databases', 'api_design', 'deployment', 'testing', 'authentication', 'state_management'] },
    android: { name: 'Android Developer', competencies: ['kotlin_java', 'android_sdk', 'jetpack_compose', 'architecture_patterns', 'networking', 'storage', 'testing', 'publishing'] },
    ios: { name: 'iOS Developer', competencies: ['swift', 'swiftui_uikit', 'architecture_patterns', 'networking', 'core_data', 'concurrency', 'testing', 'publishing'] },
    postgresql_dba: { name: 'PostgreSQL DBA', competencies: ['sql_fundamentals', 'schema_design', 'indexing', 'query_optimization', 'replication', 'backup_recovery', 'security', 'monitoring'] },
    blockchain: { name: 'Blockchain Developer', competencies: ['smart_contracts', 'cryptography', 'consensus', 'defi_protocols', 'token_standards', 'security_auditing', 'testing', 'web3_integration'] },
    qa: { name: 'QA Engineer', competencies: ['test_planning', 'manual_testing', 'automation', 'api_testing', 'performance_testing', 'ci_integration', 'bug_tracking', 'test_frameworks'] },
    software_architect: { name: 'Software Architect', competencies: ['system_design', 'design_patterns', 'microservices', 'event_driven', 'data_modeling', 'scalability', 'security_architecture', 'documentation'] },
    cyber_security: { name: 'Cyber Security Expert', competencies: ['network_security', 'web_security', 'cryptography', 'penetration_testing', 'incident_response', 'compliance', 'threat_modeling', 'forensics'] },
    ux_design: { name: 'UX Designer', competencies: ['user_research', 'wireframing', 'prototyping', 'usability_testing', 'information_architecture', 'interaction_design', 'design_systems', 'accessibility'] },
    game_developer: { name: 'Game Developer', competencies: ['game_engines', 'graphics_programming', 'physics', 'ai_pathfinding', 'networking_multiplayer', 'audio', 'optimization', 'platform_deployment'] },
    ai_data_scientist: { name: 'AI & Data Scientist', competencies: ['statistics', 'machine_learning', 'deep_learning', 'nlp', 'computer_vision', 'data_wrangling', 'model_evaluation', 'deployment'] },
    data_analyst: { name: 'Data Analyst', competencies: ['sql', 'data_visualization', 'statistics', 'spreadsheets', 'etl', 'reporting', 'python_r', 'business_intelligence'] },
    data_engineer: { name: 'Data Engineer', competencies: ['data_pipelines', 'etl', 'data_warehousing', 'streaming', 'sql', 'cloud_data_services', 'orchestration', 'data_quality'] },
    ai_engineer: { name: 'AI Engineer', competencies: ['ml_fundamentals', 'llm_integration', 'prompt_engineering', 'fine_tuning', 'rag', 'model_serving', 'evaluation', 'vector_databases'] },
    mlops: { name: 'MLOps Engineer', competencies: ['ml_pipelines', 'model_versioning', 'experiment_tracking', 'model_serving', 'monitoring', 'ci_cd_ml', 'feature_stores', 'infrastructure'] },
    product_manager: { name: 'Product Manager', competencies: ['product_strategy', 'user_research', 'roadmapping', 'stakeholder_management', 'metrics', 'prioritization', 'agile', 'technical_literacy'] },
    engineering_manager: { name: 'Engineering Manager', competencies: ['team_leadership', 'project_management', 'technical_strategy', 'hiring', 'mentoring', 'process_improvement', 'stakeholder_communication', 'architecture_oversight'] },
    developer_relations: { name: 'Developer Relations', competencies: ['technical_writing', 'public_speaking', 'community_building', 'sdk_documentation', 'developer_experience', 'content_creation', 'advocacy', 'feedback_loops'] },
    technical_writer: { name: 'Technical Writer', competencies: ['documentation_structure', 'api_documentation', 'tutorials', 'style_guides', 'diagrams', 'versioning', 'tooling', 'audience_analysis'] },
    platform_engineer: { name: 'Platform Engineer', competencies: ['infrastructure_automation', 'developer_tooling', 'ci_cd', 'observability', 'service_mesh', 'cloud_native', 'security', 'self_service_platforms'] },
    sre: { name: 'Site Reliability Engineer', competencies: ['reliability_engineering', 'incident_management', 'monitoring_alerting', 'capacity_planning', 'automation', 'slo_sli_sla', 'chaos_engineering', 'postmortems'] },
    api_design: { name: 'API Designer', competencies: ['rest_design', 'graphql_design', 'openapi_spec', 'versioning', 'authentication', 'rate_limiting', 'documentation', 'error_handling'] },
    flutter_developer: { name: 'Flutter Developer', competencies: ['dart', 'widgets', 'state_management', 'navigation', 'platform_channels', 'animations', 'testing', 'publishing'] },
    react_native_developer: { name: 'React Native Developer', competencies: ['react_fundamentals', 'native_modules', 'navigation', 'state_management', 'animations', 'platform_specific', 'testing', 'publishing'] },
    server_side_game: { name: 'Server-side Game Developer', competencies: ['networking_protocols', 'game_state_sync', 'matchmaking', 'persistence', 'scalability', 'anti_cheat', 'real_time_processing', 'load_balancing'] },
    // Skill roadmaps
    react: { name: 'React', competencies: ['components', 'hooks', 'state_management', 'routing', 'context_api', 'performance', 'testing', 'ssr_next'] },
    vue: { name: 'Vue.js', competencies: ['components', 'composition_api', 'reactivity', 'routing', 'state_management', 'directives', 'testing', 'ssr_nuxt'] },
    angular: { name: 'Angular', competencies: ['components', 'modules', 'dependency_injection', 'routing', 'rxjs', 'forms', 'testing', 'change_detection'] },
    javascript: { name: 'JavaScript', competencies: ['fundamentals', 'async_programming', 'closures_scope', 'dom_manipulation', 'es_modules', 'error_handling', 'prototypes', 'event_loop'] },
    typescript: { name: 'TypeScript', competencies: ['type_system', 'generics', 'interfaces', 'enums_unions', 'utility_types', 'type_guards', 'declaration_files', 'strict_mode'] },
    nodejs: { name: 'Node.js', competencies: ['core_modules', 'event_loop', 'streams', 'http_server', 'npm_ecosystem', 'error_handling', 'performance', 'security'] },
    python: { name: 'Python', competencies: ['fundamentals', 'oop', 'decorators_generators', 'async_await', 'packages', 'type_hints', 'testing', 'data_structures'] },
    java: { name: 'Java', competencies: ['oop', 'collections', 'generics', 'concurrency', 'streams_api', 'jvm', 'testing', 'build_tools'] },
    golang: { name: 'Go', competencies: ['fundamentals', 'goroutines_channels', 'interfaces', 'error_handling', 'packages', 'testing', 'concurrency_patterns', 'standard_library'] },
    rust: { name: 'Rust', competencies: ['ownership_borrowing', 'lifetimes', 'traits', 'error_handling', 'concurrency', 'macros', 'unsafe_code', 'cargo'] },
    cpp: { name: 'C++', competencies: ['memory_management', 'oop', 'templates', 'stl', 'smart_pointers', 'concurrency', 'move_semantics', 'build_systems'] },
    csharp: { name: 'C#', competencies: ['oop', 'linq', 'async_await', 'generics', 'delegates_events', 'dependency_injection', 'entity_framework', 'testing'] },
    swift: { name: 'Swift', competencies: ['fundamentals', 'optionals', 'protocols', 'closures', 'concurrency', 'generics', 'memory_management', 'error_handling'] },
    kotlin: { name: 'Kotlin', competencies: ['fundamentals', 'coroutines', 'null_safety', 'extensions', 'dsl', 'generics', 'collections', 'interop'] },
    php: { name: 'PHP', competencies: ['fundamentals', 'oop', 'composer', 'pdo_databases', 'frameworks', 'testing', 'security', 'performance'] },
    ruby: { name: 'Ruby', competencies: ['fundamentals', 'oop', 'blocks_procs', 'metaprogramming', 'gems', 'testing', 'rails', 'concurrency'] },
    sql: { name: 'SQL', competencies: ['queries', 'joins', 'subqueries', 'indexing', 'transactions', 'window_functions', 'stored_procedures', 'optimization'] },
    mongodb: { name: 'MongoDB', competencies: ['crud', 'aggregation', 'indexing', 'schema_design', 'replication', 'sharding', 'transactions', 'performance'] },
    redis: { name: 'Redis', competencies: ['data_structures', 'caching_patterns', 'pub_sub', 'persistence', 'clustering', 'lua_scripting', 'streams', 'security'] },
    graphql: { name: 'GraphQL', competencies: ['schema_design', 'queries_mutations', 'resolvers', 'subscriptions', 'authentication', 'pagination', 'error_handling', 'performance'] },
    docker: { name: 'Docker', competencies: ['images', 'containers', 'dockerfile', 'compose', 'networking', 'volumes', 'registry', 'security'] },
    kubernetes: { name: 'Kubernetes', competencies: ['pods_deployments', 'services', 'ingress', 'configmaps_secrets', 'storage', 'rbac', 'helm', 'monitoring'] },
    aws: { name: 'AWS', competencies: ['compute', 'storage', 'networking', 'databases', 'iam', 'serverless', 'containers', 'monitoring'] },
    terraform: { name: 'Terraform', competencies: ['hcl', 'providers', 'state_management', 'modules', 'workspaces', 'variables', 'lifecycle', 'ci_cd_integration'] },
    git: { name: 'Git', competencies: ['branching', 'merging', 'rebasing', 'cherry_pick', 'hooks', 'workflows', 'conflict_resolution', 'advanced_log'] },
    linux: { name: 'Linux', competencies: ['filesystem', 'permissions', 'processes', 'networking', 'shell_scripting', 'package_management', 'systemd', 'security'] },
    nginx: { name: 'Nginx', competencies: ['static_serving', 'reverse_proxy', 'load_balancing', 'ssl_tls', 'caching', 'rate_limiting', 'logging', 'security'] },
    prometheus: { name: 'Prometheus', competencies: ['metrics', 'promql', 'alerting', 'service_discovery', 'exporters', 'grafana_integration', 'recording_rules', 'storage'] },
    design_system: { name: 'Design System', competencies: ['component_library', 'tokens', 'documentation', 'accessibility', 'theming', 'versioning', 'testing', 'governance'] },
    tailwindcss: { name: 'Tailwind CSS', competencies: ['utility_classes', 'responsive_design', 'customization', 'components', 'plugins', 'dark_mode', 'animations', 'performance'] },
    sass: { name: 'Sass', competencies: ['variables', 'nesting', 'mixins', 'functions', 'partials', 'extends', 'operators', 'architecture'] },
    webpack: { name: 'Webpack', competencies: ['entry_output', 'loaders', 'plugins', 'code_splitting', 'dev_server', 'optimization', 'module_federation', 'configuration'] },
    vite: { name: 'Vite', competencies: ['dev_server', 'build', 'plugins', 'ssr', 'library_mode', 'env_variables', 'optimization', 'configuration'] },
    nextjs: { name: 'Next.js', competencies: ['routing', 'rendering_strategies', 'data_fetching', 'api_routes', 'middleware', 'optimization', 'deployment', 'authentication'] },
    nuxt: { name: 'Nuxt', competencies: ['routing', 'data_fetching', 'server_engine', 'modules', 'middleware', 'state_management', 'deployment', 'seo'] },
    svelte: { name: 'Svelte', competencies: ['reactivity', 'components', 'stores', 'transitions', 'actions', 'slots', 'ssr_sveltekit', 'testing'] },
    expressjs: { name: 'Express.js', competencies: ['routing', 'middleware', 'error_handling', 'template_engines', 'authentication', 'validation', 'testing', 'security'] },
    fastify: { name: 'Fastify', competencies: ['routing', 'plugins', 'hooks', 'validation', 'serialization', 'decorators', 'testing', 'performance'] },
    django: { name: 'Django', competencies: ['models', 'views', 'templates', 'orm', 'admin', 'authentication', 'rest_framework', 'testing'] },
    flask: { name: 'Flask', competencies: ['routing', 'templates', 'blueprints', 'extensions', 'database_integration', 'authentication', 'testing', 'deployment'] },
    spring_boot: { name: 'Spring Boot', competencies: ['dependency_injection', 'rest_controllers', 'data_jpa', 'security', 'actuator', 'testing', 'configuration', 'microservices'] },
    nestjs: { name: 'NestJS', competencies: ['modules', 'controllers', 'providers', 'middleware', 'guards', 'pipes', 'interceptors', 'testing'] },
    prisma: { name: 'Prisma', competencies: ['schema_modeling', 'migrations', 'queries', 'relations', 'transactions', 'raw_queries', 'seeding', 'client_generation'] },
    elasticsearch: { name: 'Elasticsearch', competencies: ['indexing', 'queries', 'aggregations', 'mappings', 'analyzers', 'cluster_management', 'performance', 'security'] },
    rabbitmq: { name: 'RabbitMQ', competencies: ['exchanges', 'queues', 'bindings', 'routing', 'dead_letter', 'clustering', 'monitoring', 'patterns'] },
    kafka: { name: 'Apache Kafka', competencies: ['topics_partitions', 'producers', 'consumers', 'consumer_groups', 'streams', 'connect', 'schema_registry', 'monitoring'] },
    solana: { name: 'Solana Development', competencies: ['accounts_model', 'programs', 'transactions', 'pda', 'tokens', 'anchor_framework', 'testing', 'security'] },
};
// ─── Claude Code Evaluator ──────────────────────────────────────────────────
function buildEvalPrompt(messages) {
    // Build base dimension reference
    const baseDimRef = BASE_DIMENSION_KEYS.map(key => {
        const d = BASE_DIMENSIONS[key];
        return `### ${d.label} (key: "${key}")
${d.description}
Signals: ${d.signals.join(' | ')}
Ranges:
${d.ranges.map(r => `  ${r.min}-${r.max}: ${r.description}`).join('\n')}`;
    }).join('\n\n');
    // Build domain dimension reference
    const domainDimRef = DOMAIN_DIMENSION_KEYS.map(key => {
        const d = DOMAIN_DIMENSIONS[key];
        return `### ${d.label} (key: "${key}")
${d.description}
Signals: ${d.signals.join(' | ')}
Ranges:
${d.ranges.map(r => `  ${r.min}-${r.max}: ${r.description}`).join('\n')}`;
    }).join('\n\n');
    // Format conversation (cap at ~80 messages to stay within context)
    const capped = messages.slice(-80);
    const convo = capped.map(m => {
        const role = m.role.toUpperCase();
        const content = (m.content || '').slice(0, 600);
        const tools = m.tool_uses ? (() => {
            try {
                const parsed = JSON.parse(m.tool_uses);
                if (Array.isArray(parsed)) {
                    return ` [tools: ${parsed.map((t) => t.name || '?').join(', ')}]`;
                }
            }
            catch { /* ignore */ }
            return '';
        })() : '';
        return `[${role}]${tools} ${content}`;
    }).join('\n\n');
    // Build roadmap catalog excerpt for tech detection
    const roadmapList = Object.entries(ALL_ROADMAPS)
        .map(([key, r]) => `${key}: ${r.name} (${r.competencies.slice(0, 4).join(', ')}...)`)
        .join('\n');
    return `You are a developer productivity evaluator for PromptUp. Analyze the following conversation between a developer (USER) and an AI coding assistant (ASSISTANT).

Score the DEVELOPER across 11 dimensions (6 base + 5 domain) AND detect which technologies/roadmaps are demonstrated.

## Base Dimensions (interaction quality)

${baseDimRef}

## Domain Dimensions (depth of understanding)

${domainDimRef}

## Tech Expertise Detection

From the conversation, identify which technology roadmaps the developer is working with. For each detected roadmap, score the developer's demonstrated competency level 0-100. Use these roadmap keys:
${roadmapList}

## Conversation (${messages.length} messages)

${convo}

## Instructions

1. Score each of the 11 dimensions 0-100 based on the developer's (USER's) behavior, not the assistant's quality.
2. Provide specific, concrete reasoning referencing actual messages.
3. Give 1-3 feedback items for the developer's weakest areas. First, categorize their prompts:
   - COMMANDS ("eval now", "build it") — clear directives, fine terse. Do NOT suggest improvements for these.
   - DECISIONS ("yep", "3", "go with that") — the developer picked an option. Don't ask them to explain why. Instead, suggest how they could BUILD ON IT — combine approaches, add constraints, refine the solution. The goal is shaping the output, not justifying the choice.
   - STEERING ("not like that", "use X instead") — the developer redirected. Only flag if the assistant needed follow-up clarification.
   - AMBIGUOUS ("is it correct?", "check the thing") — needs referent clarity. Only flag if the referent was actually unclear.

   Only generate suggestions for DECISIONS, STEERING, and AMBIGUOUS prompts — NEVER for clear COMMANDS. Each recommendation MUST have BOTH fields:
   - recommendation: Short coaching tip (max 60 chars). Frame as opportunity to shape better output, not as criticism. This shows in the developer's status bar.
   - suggestions: REQUIRED array of 2-3 before→after examples from THIS session. The "after" version should show how adding one idea, constraint, or combination would produce a BETTER SOLUTION — not just explain the choice. Format: "Instead of '<actual prompt>', try '<improved version that shapes the output>'"
4. Detect technologies used and score the developer's demonstrated expertise per roadmap.
5. Produce a concise activity log: a chronological list of what was accomplished in this session.
6. Extract the developer's KEY DECISIONS — moments where they steered, rejected, validated, modified, or scoped the AI's work. For each decision:
   - type: "steer" (redirected approach), "reject" (refused output), "validate" (tested/verified), "modify" (accepted with changes), "scope" (added/removed work), "accept" (approved output)
   - summary: One sentence describing WHAT was decided and WHY (max 100 chars). Write as "Chose X over Y because Z" or "Rejected X, asked for Y instead" — be specific, not generic.
   - signal: "high" (architectural/strategic decision), "medium" (tactical choice), "low" (routine approval)
   - Only include decisions where the developer actively influenced direction. Skip routine "ok" / "looks good" unless they approved something significant.

Return ONLY valid JSON with no markdown formatting, no code fences, no extra text:
{"dimensions":[{"key":"task_decomposition","score":0,"reasoning":"..."},{"key":"prompt_specificity","score":0,"reasoning":"..."},{"key":"output_validation","score":0,"reasoning":"..."},{"key":"iteration_quality","score":0,"reasoning":"..."},{"key":"strategic_tool_usage","score":0,"reasoning":"..."},{"key":"context_management","score":0,"reasoning":"..."}],"domain_dimensions":[{"key":"architectural_awareness","score":0,"reasoning":"..."},{"key":"error_anticipation","score":0,"reasoning":"..."},{"key":"technical_vocabulary","score":0,"reasoning":"..."},{"key":"dependency_reasoning","score":0,"reasoning":"..."},{"key":"tradeoff_articulation","score":0,"reasoning":"..."}],"tech_expertise":[{"roadmap":"typescript","score":75,"competencies":{"type_system":80,"generics":70}}],"recommendations":[{"dimension_key":"...","priority":"high","recommendation":"Add context to prompts","suggestions":["Instead of 'no', try 'no — terminal shows nothing after response'","Instead of 'yep', try 'yes, use the Stop hook approach'"]}],"activity_log":["Did X","Did Y","Fixed Z"],"decisions":[{"type":"steer","summary":"Chose bcrypt over argon2 — simpler dependency","signal":"high"},{"type":"validate","summary":"Ran integration tests after auth implementation","signal":"medium"}]}`;
}
function runClaudeCode(prompt, timeoutMs = 120_000) {
    return new Promise((resolve, reject) => {
        // Strip CLAUDECODE env var to allow spawning from within a Claude Code session
        const env = { ...process.env };
        delete env.CLAUDECODE;
        delete env.CLAUDE_CODE;
        const proc = spawn('claude', ['-p', '--output-format', 'text', '--no-session-persistence'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        const timer = setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error(`Claude Code timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve(stdout.trim());
            }
            else {
                reject(new Error(`Claude Code exited with code ${code}: ${stderr.slice(0, 500)}`));
            }
        });
        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        // Write prompt to stdin and close
        proc.stdin.write(prompt);
        proc.stdin.end();
    });
}
function parseClaudeResponse(raw) {
    // Claude might wrap in markdown code fences despite instructions
    let cleaned = raw.trim();
    // Strip markdown code fences
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    // Find the JSON object
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON object found in Claude response');
    }
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(cleaned);
    if (!parsed.dimensions || !Array.isArray(parsed.dimensions)) {
        throw new Error('Missing dimensions array in response');
    }
    return parsed;
}
// ─── Main Evaluator ─────────────────────────────────────────────────────────
export async function evaluateSession(sessionId, messages, triggerType, weightProfile = 'balanced') {
    if (messages.length < 3)
        return null;
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length === 0)
        return null;
    const profile = WEIGHT_PROFILES[weightProfile] ?? WEIGHT_PROFILES.balanced;
    // Try Claude Code first, fall back to heuristic
    let dimensionScores;
    let domainDimensionScores = [];
    let techExpertise = [];
    let rawEvaluation = null;
    let recommendations = [];
    let usedClaude = false;
    try {
        console.log(`[eval] Running Claude Code evaluation for session ${sessionId.slice(0, 8)}...`);
        const prompt = buildEvalPrompt(messages);
        const rawOutput = await runClaudeCode(prompt);
        const result = parseClaudeResponse(rawOutput);
        usedClaude = true;
        // Store structured data in raw_evaluation (activity log + decisions + raw text)
        rawEvaluation = JSON.stringify({
            activity_log: result.activity_log || [],
            decisions: result.decisions || [],
            domain_dimensions: result.domain_dimensions || [],
            tech_expertise: result.tech_expertise || [],
            raw_text: rawOutput,
        });
        // Persist Claude-extracted decisions to the decisions table
        if (result.decisions && result.decisions.length > 0) {
            for (const d of result.decisions) {
                const validTypes = ['steer', 'accept', 'reject', 'modify', 'validate', 'scope'];
                const type = validTypes.includes(d.type) ? d.type : 'accept';
                const validSignals = ['high', 'medium', 'low'];
                const signal = validSignals.includes(d.signal) ? d.signal : 'medium';
                insertDecision({
                    id: ulid(),
                    session_id: sessionId,
                    type: type,
                    message_index: 0,
                    context: d.summary.slice(0, 200),
                    files_affected: '[]',
                    source: 'plugin',
                    matched_rule: null,
                    depth: signal === 'high' ? 'architectural' : signal === 'medium' ? 'tactical' : 'surface',
                    opinionation: signal === 'high' ? 'high' : signal === 'medium' ? 'medium' : 'low',
                    ai_action: null,
                    signal: signal,
                    created_at: new Date().toISOString(),
                });
            }
        }
        // Map Claude's base dimension scores to our format with weights
        dimensionScores = BASE_DIMENSION_KEYS.map(key => {
            const claudeDim = result.dimensions.find(d => d.key === key);
            return {
                key,
                score: Math.max(0, Math.min(100, Math.round(claudeDim?.score ?? 50))),
                weight: profile.weights[key],
                reasoning: claudeDim?.reasoning ?? 'No reasoning provided',
            };
        });
        // Map Claude's domain dimension scores
        if (result.domain_dimensions && result.domain_dimensions.length > 0) {
            const domainWeight = 1 / DOMAIN_DIMENSION_KEYS.length;
            domainDimensionScores = DOMAIN_DIMENSION_KEYS.map(key => {
                const claudeDim = result.domain_dimensions.find(d => d.key === key);
                return {
                    key,
                    score: Math.max(0, Math.min(100, Math.round(claudeDim?.score ?? 50))),
                    weight: domainWeight,
                    reasoning: claudeDim?.reasoning ?? 'No reasoning provided',
                };
            });
        }
        // Map Claude's tech expertise
        if (result.tech_expertise && result.tech_expertise.length > 0) {
            techExpertise = result.tech_expertise
                .filter(te => te.roadmap && ALL_ROADMAPS[te.roadmap])
                .map(te => {
                const roadmapDef = ALL_ROADMAPS[te.roadmap];
                const competencies = {};
                for (const comp of roadmapDef.competencies) {
                    competencies[comp] = {
                        score: te.competencies?.[comp] ?? null,
                        demonstrated: te.competencies?.[comp] != null,
                    };
                }
                return {
                    roadmap: te.roadmap,
                    score: Math.max(0, Math.min(100, Math.round(te.score))),
                    competencies,
                };
            });
        }
        // Use Claude's recommendations (with suggestions if provided)
        recommendations = (result.recommendations || []).slice(0, 3).map(r => ({
            dimension_key: r.dimension_key,
            priority: r.priority || 'medium',
            recommendation: r.recommendation,
            suggestions: r.suggestions,
        }));
        console.log(`[eval] Claude Code evaluation complete for ${sessionId.slice(0, 8)}`);
    }
    catch (err) {
        console.warn(`[eval] Claude Code unavailable, using heuristic fallback:`, err.message);
        // Fall back to heuristic — generate basic activity log from messages
        const heuristic = heuristicEvaluate(messages, profile);
        dimensionScores = heuristic.dimensionScores;
        domainDimensionScores = heuristic.domainDimensionScores;
        techExpertise = heuristicTechDetect(messages);
        recommendations = heuristic.recommendations;
        rawEvaluation = JSON.stringify({
            activity_log: heuristicActivityLog(messages),
            domain_dimensions: domainDimensionScores,
            tech_expertise: techExpertise,
            raw_text: null,
        });
    }
    // Compute base composite score
    const composite = computeCompositeScore(dimensionScores.map(d => ({ score: d.score, weight: d.weight })));
    // Compute domain composite
    const domainComposite = domainDimensionScores.length > 0
        ? computeDomainComposite(Object.fromEntries(domainDimensionScores.map(d => [d.key, { score: d.score, weight: d.weight }])))
        : null;
    // Compute tech composite
    const techComposite = techExpertise.length > 0
        ? computeTechComposite(techExpertise)
        : null;
    // Compute overall and grand composites
    const overallComposite = computeOverallComposite(composite, domainComposite);
    const grandComposite = computeGrandComposite(overallComposite, techComposite);
    // Compute trends from previous evaluation
    const prevEval = getLatestEvaluation(sessionId);
    let trends = null;
    if (prevEval) {
        const prevScores = JSON.parse(prevEval.dimension_scores);
        const prevMap = new Map(prevScores.map(d => [d.key, d.score]));
        trends = dimensionScores.map(d => {
            const prev = prevMap.get(d.key) ?? d.score;
            const delta = d.score - prev;
            return {
                dimension_key: d.key,
                direction: delta > 3 ? 'improving' : delta < -3 ? 'declining' : 'stable',
                delta,
                previous_score: prev,
                current_score: d.score,
            };
        });
    }
    // Compute risk flags
    const riskFlags = computeRiskFlagsWithHistory(dimensionScores.map(d => ({ dimension: d.key, score: d.score })), prevEval ? JSON.parse(prevEval.dimension_scores).map((d) => ({ dimension: d.key, score: d.score })) : null, composite);
    // Build evaluation row
    const seqNumbers = messages.map(m => m.sequence_number);
    const triggerReason = `${triggerType}${usedClaude ? '' : ' [heuristic]'}`;
    const evalRow = {
        id: ulid(),
        session_id: sessionId,
        trigger_type: triggerType,
        report_type: 'checkpoint',
        composite_score: composite,
        dimension_scores: JSON.stringify([...dimensionScores, ...domainDimensionScores]),
        recommendations: JSON.stringify(recommendations),
        trends: trends ? JSON.stringify(trends) : null,
        risk_flags: JSON.stringify(riskFlags),
        message_range_from: Math.min(...seqNumbers),
        message_range_to: Math.max(...seqNumbers),
        message_count: messages.length,
        weight_profile: weightProfile,
        raw_evaluation: JSON.stringify({
            ...(rawEvaluation ? JSON.parse(rawEvaluation) : {}),
            trigger_reason: triggerReason,
            domain_composite_score: domainComposite,
            tech_composite_score: techComposite,
            overall_composite_score: overallComposite,
            grand_composite_score: grandComposite,
            tech_expertise: techExpertise,
        }),
        created_at: new Date().toISOString(),
    };
    insertEvaluation(evalRow);
    return evalRow;
}
// ─── Heuristic Fallback ─────────────────────────────────────────────────────
function heuristicEvaluate(messages, profile) {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const dimensionScores = BASE_DIMENSION_KEYS.map(key => {
        const scorer = HEURISTIC_SCORERS[key];
        const { score, reasoning } = scorer(userMessages, assistantMessages);
        return { key, score, weight: profile.weights[key], reasoning };
    });
    const domainWeight = 1 / DOMAIN_DIMENSION_KEYS.length;
    const domainDimensionScores = DOMAIN_DIMENSION_KEYS.map(key => {
        const scorer = DOMAIN_HEURISTIC_SCORERS[key];
        const { score, reasoning } = scorer(userMessages, assistantMessages);
        return { key, score, weight: domainWeight, reasoning };
    });
    // Recommendations for weakest across all 11 dimensions
    const allScores = [...dimensionScores, ...domainDimensionScores];
    const sorted = [...allScores].sort((a, b) => a.score - b.score);
    const recommendations = [];
    for (const dim of sorted.slice(0, 3)) {
        if (dim.score >= 75)
            break;
        const def = BASE_DIMENSIONS[dim.key]
            ?? DOMAIN_DIMENSIONS[dim.key];
        if (!def)
            continue;
        const next = def.ranges.find(r => r.min > dim.score);
        recommendations.push({
            dimension_key: dim.key,
            priority: dim.score < 35 ? 'high' : dim.score < 55 ? 'medium' : 'low',
            recommendation: next ? `Aim for: ${next.description}` : 'Continue current approach',
            suggestions: def.signals.slice(0, 2),
        });
    }
    return { dimensionScores, domainDimensionScores, recommendations };
}
// ─── Heuristic Scoring Functions ────────────────────────────────────────────
function countPhrases(text, phrases) {
    const lower = text.toLowerCase();
    return phrases.reduce((c, p) => c + (lower.includes(p) ? 1 : 0), 0);
}
function avgLen(msgs) {
    if (msgs.length === 0)
        return 0;
    return msgs.reduce((s, m) => s + (m.content?.length ?? 0), 0) / msgs.length;
}
function clamp(v) {
    return Math.max(0, Math.min(100, Math.round(v)));
}
function getToolNames(msgs) {
    const tools = new Set();
    for (const m of msgs) {
        if (!m.tool_uses)
            continue;
        try {
            const uses = JSON.parse(m.tool_uses);
            if (Array.isArray(uses))
                uses.forEach((u) => { if (u.name)
                    tools.add(u.name); });
        }
        catch { /* ignore */ }
    }
    return tools;
}
const HEURISTIC_SCORERS = {
    task_decomposition(user) {
        let s = 45;
        const r = [];
        const dc = user.reduce((c, m) => c + countPhrases(m.content ?? '', ['first', 'then', 'next', 'step 1', 'step 2', '1.', '2.', '3.', 'now that', 'finally']), 0);
        const ratio = dc / (user.length || 1);
        if (ratio > 0.5) {
            s += 20;
            r.push('frequent step-by-step');
        }
        else if (ratio > 0.2) {
            s += 10;
            r.push('some structure');
        }
        if (avgLen(user) > 800 && ratio < 0.2) {
            s -= 15;
            r.push('long prompts, no decomposition');
        }
        return { score: clamp(s), reasoning: r.join('; ') || 'baseline' };
    },
    prompt_specificity(user) {
        let s = 40;
        const r = [];
        const al = avgLen(user);
        if (al > 500) {
            s += 15;
            r.push('detailed');
        }
        else if (al < 50) {
            s -= 10;
            r.push('very short');
        }
        const code = user.filter(m => /```/.test(m.content ?? '')).length;
        if (code > 0) {
            s += Math.min(code * 4, 15);
            r.push(`code examples (${code}x)`);
        }
        const con = user.reduce((c, m) => c + countPhrases(m.content ?? '', ["don't", 'must', 'should not', 'only', 'ensure']), 0);
        if (con > 3) {
            s += 12;
            r.push('constraints');
        }
        else if (con > 0)
            s += 5;
        return { score: clamp(s), reasoning: r.join('; ') || 'baseline' };
    },
    output_validation(user) {
        let s = 35;
        const r = [];
        const follow = user.slice(1);
        const vc = follow.reduce((c, m) => c + countPhrases(m.content ?? '', ["that's wrong", "doesn't work", 'fix', 'bug', 'error', 'actually', 'wrong', 'broken']), 0);
        if (vc > 3) {
            s += 25;
            r.push(`challenges (${vc}x)`);
        }
        else if (vc > 0) {
            s += 10;
            r.push('some validation');
        }
        const ex = follow.reduce((c, m) => c + countPhrases(m.content ?? '', ['why', 'explain', 'how does']), 0);
        if (ex > 0) {
            s += Math.min(ex * 4, 12);
            r.push('asks explanations');
        }
        return { score: clamp(s), reasoning: r.join('; ') || 'limited validation' };
    },
    iteration_quality(user) {
        let s = 45;
        const r = [];
        if (user.length < 2)
            return { score: 50, reasoning: 'too few messages' };
        const pivots = user.reduce((c, m) => c + countPhrases(m.content ?? '', ['different approach', 'instead', "let's try", 'scratch that']), 0);
        if (pivots > 0) {
            s += Math.min(pivots * 7, 15);
            r.push(`pivots (${pivots}x)`);
        }
        // repetition
        let reps = 0;
        for (let i = 1; i < user.length; i++) {
            const a = new Set((user[i - 1].content ?? '').toLowerCase().split(/\s+/));
            const b = new Set((user[i].content ?? '').toLowerCase().split(/\s+/));
            if (a.size > 5 && b.size > 5) {
                const inter = [...b].filter(w => a.has(w)).length;
                if (inter / Math.max(a.size, b.size) > 0.6)
                    reps++;
            }
        }
        if (reps > 2) {
            s -= 15;
            r.push('repetitive');
        }
        else {
            s += 10;
            r.push('distinct iterations');
        }
        return { score: clamp(s), reasoning: r.join('; ') || 'baseline' };
    },
    strategic_tool_usage(_user, asst) {
        let s = 40;
        const r = [];
        const tools = getToolNames(asst);
        if (tools.size >= 6) {
            s += 25;
            r.push(`${tools.size} tool types`);
        }
        else if (tools.size >= 3) {
            s += 15;
            r.push(`${tools.size} tool types`);
        }
        else if (tools.size >= 1) {
            s += 5;
            r.push(`${tools.size} tool type`);
        }
        if (tools.has('Read') || tools.has('Grep')) {
            s += 8;
            r.push('exploration');
        }
        if (tools.has('Edit') || tools.has('Write')) {
            s += 5;
            r.push('modification');
        }
        if (tools.has('Bash')) {
            s += 5;
            r.push('shell');
        }
        return { score: clamp(s), reasoning: r.join('; ') || 'no tools' };
    },
    context_management(user) {
        let s = 40;
        const r = [];
        const first = (user[0]?.content ?? '').length;
        if (first > 500) {
            s += 15;
            r.push('strong initial context');
        }
        else if (first < 50) {
            s -= 5;
            r.push('minimal context');
        }
        const ctx = user.reduce((c, m) => c + countPhrases(m.content ?? '', ['for context', 'background', 'so far', 'to recap', 'previously']), 0);
        if (ctx > 3) {
            s += 15;
            r.push('active context mgmt');
        }
        else if (ctx > 0)
            s += 7;
        return { score: clamp(s), reasoning: r.join('; ') || 'baseline' };
    },
};
// ─── Domain Dimension Heuristic Scorers ────────────────────────────────────
const DOMAIN_HEURISTIC_SCORERS = {
    architectural_awareness(user) {
        let s = 40;
        const r = [];
        const archPhrases = ['architecture', 'design pattern', 'component', 'module', 'layer', 'service', 'microservice', 'monolith', 'separation of concerns', 'coupling', 'cohesion', 'boundary', 'interface'];
        const ac = user.reduce((c, m) => c + countPhrases(m.content ?? '', archPhrases), 0);
        if (ac > 5) {
            s += 25;
            r.push(`strong architecture awareness (${ac}x)`);
        }
        else if (ac > 2) {
            s += 15;
            r.push('some architecture discussion');
        }
        else if (ac > 0) {
            s += 5;
            r.push('minimal architecture mentions');
        }
        const systemPhrases = ['scaling', 'performance', 'latency', 'throughput', 'bottleneck', 'trade-off', 'migration'];
        const sc = user.reduce((c, m) => c + countPhrases(m.content ?? '', systemPhrases), 0);
        if (sc > 2) {
            s += 10;
            r.push('system-level thinking');
        }
        return { score: clamp(s), reasoning: r.join('; ') || 'limited architecture awareness' };
    },
    error_anticipation(user) {
        let s = 35;
        const r = [];
        const errorPhrases = ['edge case', 'error handling', 'what if', 'failure', 'fallback', 'timeout', 'retry', 'catch', 'throw', 'validate', 'null check', 'undefined', 'boundary'];
        const ec = user.reduce((c, m) => c + countPhrases(m.content ?? '', errorPhrases), 0);
        if (ec > 5) {
            s += 30;
            r.push(`proactive error thinking (${ec}x)`);
        }
        else if (ec > 2) {
            s += 15;
            r.push('some error consideration');
        }
        else if (ec > 0) {
            s += 5;
            r.push('minimal error awareness');
        }
        const testPhrases = ['test', 'spec', 'assert', 'expect', 'unhappy path', 'negative test'];
        const tc = user.reduce((c, m) => c + countPhrases(m.content ?? '', testPhrases), 0);
        if (tc > 2) {
            s += 10;
            r.push('tests for error cases');
        }
        return { score: clamp(s), reasoning: r.join('; ') || 'limited error anticipation' };
    },
    technical_vocabulary(user) {
        let s = 45;
        const r = [];
        const preciseTerms = ['idempotent', 'polymorphism', 'encapsulation', 'immutable', 'pure function', 'side effect', 'closure', 'decorator', 'middleware', 'serialization', 'deserialization', 'abstraction', 'dependency injection', 'generic', 'type guard', 'discriminated union', 'enum', 'interface', 'schema', 'migration', 'ORM', 'query builder'];
        const pc = user.reduce((c, m) => c + countPhrases(m.content ?? '', preciseTerms), 0);
        if (pc > 6) {
            s += 25;
            r.push(`precise vocabulary (${pc} terms)`);
        }
        else if (pc > 3) {
            s += 15;
            r.push('good technical language');
        }
        else if (pc > 0) {
            s += 5;
            r.push('basic technical terms');
        }
        // Check message clarity (longer, more specific messages suggest better vocabulary)
        const al = avgLen(user);
        if (al > 300) {
            s += 5;
            r.push('detailed communication');
        }
        return { score: clamp(s), reasoning: r.join('; ') || 'baseline vocabulary' };
    },
    dependency_reasoning(user) {
        let s = 40;
        const r = [];
        const depPhrases = ['import', 'require', 'dependency', 'depends on', 'peer dep', 'circular', 'side effect', 'breaking change', 'downstream', 'upstream', 'coupling', 'version', 'compatible'];
        const dc = user.reduce((c, m) => c + countPhrases(m.content ?? '', depPhrases), 0);
        if (dc > 5) {
            s += 25;
            r.push(`strong dependency awareness (${dc}x)`);
        }
        else if (dc > 2) {
            s += 12;
            r.push('some dependency discussion');
        }
        else if (dc > 0) {
            s += 5;
            r.push('minimal dependency mentions');
        }
        const flowPhrases = ['data flow', 'call chain', 'event', 'propagate', 'cascade', 'trigger'];
        const fc = user.reduce((c, m) => c + countPhrases(m.content ?? '', flowPhrases), 0);
        if (fc > 1) {
            s += 10;
            r.push('traces data flow');
        }
        return { score: clamp(s), reasoning: r.join('; ') || 'limited dependency reasoning' };
    },
    tradeoff_articulation(user) {
        let s = 40;
        const r = [];
        const tradeoffPhrases = ['trade-off', 'tradeoff', 'pros and cons', 'alternative', 'versus', 'vs', 'instead of', 'compared to', 'option a', 'option b', 'approach', 'downside', 'benefit'];
        const tc = user.reduce((c, m) => c + countPhrases(m.content ?? '', tradeoffPhrases), 0);
        if (tc > 4) {
            s += 25;
            r.push(`explicit tradeoff analysis (${tc}x)`);
        }
        else if (tc > 1) {
            s += 12;
            r.push('some alternatives considered');
        }
        else if (tc > 0) {
            s += 5;
            r.push('occasional comparison');
        }
        const reasoningPhrases = ['because', 'since', 'the reason', 'rationale', 'chose this because', 'better because', 'prefer', 'maintainable', 'readable'];
        const rc = user.reduce((c, m) => c + countPhrases(m.content ?? '', reasoningPhrases), 0);
        if (rc > 3) {
            s += 10;
            r.push('explains reasoning');
        }
        return { score: clamp(s), reasoning: r.join('; ') || 'limited tradeoff discussion' };
    },
};
// ─── Heuristic Tech Detection ──────────────────────────────────────────────
/** Simple tech detection from conversation content for heuristic fallback. */
function heuristicTechDetect(messages) {
    const allText = messages.map(m => m.content ?? '').join(' ').toLowerCase();
    const toolText = messages
        .filter(m => m.tool_uses)
        .map(m => m.tool_uses)
        .join(' ')
        .toLowerCase();
    const TECH_SIGNALS = {
        typescript: { patterns: ['typescript', '.ts', 'tsconfig', 'type guard', 'interface', 'generic'], fileExts: ['.ts', '.tsx'] },
        react: { patterns: ['react', 'usestate', 'useeffect', 'jsx', 'component', 'props'], fileExts: ['.tsx', '.jsx'] },
        nextjs: { patterns: ['next.js', 'nextjs', 'next.config', 'app router', 'server component', 'getserversideprops'] },
        nodejs: { patterns: ['node.js', 'nodejs', 'express', 'npm', 'pnpm', 'package.json'], fileExts: ['.mjs', '.cjs'] },
        python: { patterns: ['python', 'pip', 'django', 'flask', 'pytest', 'requirements.txt'], fileExts: ['.py'] },
        docker: { patterns: ['docker', 'dockerfile', 'container', 'docker-compose', 'image'] },
        sql: { patterns: ['select', 'insert', 'join', 'postgresql', 'mysql', 'migration', 'drizzle', 'prisma'] },
        git: { patterns: ['git commit', 'git push', 'branch', 'merge', 'rebase', 'pull request'] },
        tailwindcss: { patterns: ['tailwind', 'className', 'utility class', 'tw-'] },
        golang: { patterns: ['golang', 'go.mod', 'goroutine', 'chan ', 'func main'], fileExts: ['.go'] },
        rust: { patterns: ['cargo', 'rustc', '.rs', 'fn main', 'impl ', 'trait '], fileExts: ['.rs'] },
    };
    const detected = [];
    for (const [key, { patterns, fileExts }] of Object.entries(TECH_SIGNALS)) {
        let hits = 0;
        for (const p of patterns) {
            if (allText.includes(p))
                hits++;
        }
        if (fileExts) {
            for (const ext of fileExts) {
                if (toolText.includes(ext))
                    hits += 2;
            }
        }
        if (hits >= 2 && ALL_ROADMAPS[key]) {
            const roadmapDef = ALL_ROADMAPS[key];
            const competencies = {};
            for (const comp of roadmapDef.competencies) {
                competencies[comp] = { score: null, demonstrated: false };
            }
            // Score based on signal density — more mentions = higher demonstrated expertise
            const score = clamp(35 + Math.min(hits * 8, 45));
            detected.push({ roadmap: key, score, competencies });
        }
    }
    return detected;
}
// ─── Heuristic Activity Log ─────────────────────────────────────────────────
function heuristicActivityLog(messages) {
    const log = [];
    const toolFiles = new Set();
    for (const m of messages) {
        if (m.role === 'user') {
            const text = (m.content ?? '').slice(0, 100).replace(/\n/g, ' ').trim();
            if (text)
                log.push(`User: ${text}`);
        }
        if (m.tool_uses) {
            try {
                const uses = JSON.parse(m.tool_uses);
                if (Array.isArray(uses)) {
                    for (const u of uses) {
                        const name = u.name || 'unknown';
                        if ((name === 'Edit' || name === 'Write') && u.input?.file_path) {
                            const file = u.input.file_path.split('/').pop();
                            if (!toolFiles.has(file)) {
                                toolFiles.add(file);
                                log.push(`${name === 'Write' ? 'Created' : 'Modified'} ${file}`);
                            }
                        }
                        else if (name === 'Bash' && u.input?.command) {
                            const cmd = u.input.command.slice(0, 60);
                            log.push(`Ran: ${cmd}`);
                        }
                    }
                }
            }
            catch { /* ignore */ }
        }
    }
    return log.slice(0, 30); // Cap at 30 entries
}
