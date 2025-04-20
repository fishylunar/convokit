import { loadConfig } from './ConvoKitConfig';

// Load config once at the start
let configLoaded = false;
let enableDebugging = false;
let enablePerformanceStats = true;
let enableWarnings = true;

async function ensureConfigLoaded():Promise<void> {
    if (!configLoaded) {
        try {
            const config = await loadConfig();
            enableDebugging = config.enableDebugging ?? false;
            enablePerformanceStats = config.enablePerformanceStats ?? true;
            enableWarnings = config.enableWarnings ?? true;
            configLoaded = true;
        } catch (err) {
            // Log error during initial load attempt, but allow logging functions to work
            console.error(`[ERROR] ${new Date().toISOString()} - ConvoKitConfig: Failed to load config initially: ${err.message}`);
            // Use default logging settings if config fails
        }
    }
}

const timers = new Map<string, number>();

async function log(level: 'INFO' | 'ERROR' | 'DEBUG' | 'WARN' | 'SUCCESS', where: string, ...args: any[]): Promise<void> {
    await ensureConfigLoaded(); // Ensure config is loaded before logging
    switch (level) {
        case 'INFO':
        case 'SUCCESS': // Treat SUCCESS like INFO for now, maybe add color later
            console.log(`[${level}] ${new Date().toISOString()} - ${where}:`, ...args);
            break;
        case 'ERROR':
            console.error(`[ERROR] ${new Date().toISOString()} - ${where}:`, ...args);
            break;
        case 'DEBUG':
            if (enableDebugging) {
                console.debug(`[DEBUG] ${new Date().toISOString()} - ${where}:`, ...args);
            }
            break;
        case 'WARN':
            if (enableWarnings) {
                console.warn(`[WARN] ${new Date().toISOString()} - ${where}:`, ...args);
            }
            break;
    }
}

async function time(where: string, timerName: string): Promise<void> {
    await ensureConfigLoaded();
    if (!enablePerformanceStats) return;
    const key = `${where}:${timerName}`;
    timers.set(key, Date.now());
    await log('INFO', where, `--------- Started timer: ${timerName} ---------`);
}

async function timeEnd(where: string, timerName: string): Promise<void> {
    await ensureConfigLoaded();
    if (!enablePerformanceStats) return;
    const key = `${where}:${timerName}`;
    const startTime = timers.get(key);
    if (startTime === undefined) {
        await log('ERROR', where, `No such timer: ${timerName}`);
        return;
    }
    const elapsed = Date.now() - startTime;
    timers.delete(key);
    await log('INFO', where, `--------- ${timerName} took ${elapsed}ms --------- `);
}

// Exported logging functions
export const ConvoKitLogging = {
    info: (where: string, ...args: any[]) => log('INFO', where, ...args),
    error: (where: string, ...args: any[]) => log('ERROR', where, ...args),
    debug: (where: string, ...args: any[]) => log('DEBUG', where, ...args),
    warn: (where: string, ...args: any[]) => log('WARN', where, ...args),
    success: (where: string, ...args: any[]) => log('SUCCESS', where, ...args),
    time: time,
    timeEnd: timeEnd,
};