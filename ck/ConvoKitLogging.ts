import { loadConfig, getConfig } from './ConvoKitConfig';

await loadConfig();

const { enableDebugging, enablePerformanceStats, enableWarnings } = getConfig();
const timers = new Map<string, number>();

function info(where: string, ...args: any[]): void {
    return console.log(`[INFO] ${new Date().toISOString()} - ${where}:`, ...args);
}
function error(where: string, ...args: any[]): void {
    return console.error(`[ERROR] ${new Date().toISOString()} - ${where}:`, ...args);
}
function debug(where: string, ...args: any[]): void {
    if (!enableDebugging) return;
    return console.debug(`[DEBUG] ${new Date().toISOString()} - ${where}:`, ...args);
}
function warn(where: string, ...args: any[]): void {
    if (!enableWarnings) return;
    return console.warn(`[WARN] ${new Date().toISOString()} - ${where}:`, ...args);
}

function time(where: string, timerName: string): void {
    if (!enablePerformanceStats) return;
    const key = `${where}:${timerName}`;
    timers.set(key, Date.now());
    return info(where, `--------- Started timer: ${timerName} ---------`);
}

function timeEnd(where: string, timerName: string): void {
    if (!enablePerformanceStats) return;
    const key = `${where}:${timerName}`;
    const startTime = timers.get(key);
    if (startTime === undefined) {
        error(where, `No such timer: ${timerName}`);
        return;
    }
    const elapsed = Date.now() - startTime;
    timers.delete(key);
    return info(where, `--------- ${timerName} took ${elapsed}ms --------- `);
}

export const ConvoKitLogging = { info, error, debug, warn, time, timeEnd };

export default ConvoKitLogging;